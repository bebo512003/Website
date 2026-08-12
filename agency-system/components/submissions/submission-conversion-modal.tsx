'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, FolderKanban, LoaderCircle, ShieldCheck, Users } from 'lucide-react'
import {
  convertSubmissionToProject,
  type AdminSubmissionRow,
  type SubmissionProjectConversionInput,
} from '@/lib/supabase/database'
import type { Client, Profile, Project, ProjectPriority, ProjectStatus } from '@/lib/supabase/types'
import {
  InlineAlert,
  Modal,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '@/components/ui/page'

const PROJECT_TYPES = ['General', 'Branding', 'Website', 'Marketing', 'Content', 'Translation', 'Consulting']
const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}
const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  review: 'In review',
  completed: 'Completed',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
}

type ClientMode = 'existing' | 'new'
type Step = 'configure' | 'confirm'
type Draft = {
  clientMode: ClientMode
  clientId: string
  clientName: string
  clientType: Client['type']
  clientContact: string
  clientEmail: string
  clientPhone: string
  projectName: string
  description: string
  projectType: string
  priority: ProjectPriority
  status: ProjectStatus
  phase: string
  phaseName: string
  startDate: string
  dueDate: string
  budget: string
  currency: string
  ownerId: string
  managerId: string
  teamMemberIds: string[]
}

function displayName(member: Pick<Profile, 'full_name' | 'email' | 'job_title'>): string {
  return `${member.full_name || member.email}${member.job_title ? ` — ${member.job_title}` : ''}`
}

function makeDraft(
  submission: AdminSubmissionRow,
  clients: Client[],
  team: Profile[],
  currentUserId: string | null
): Draft {
  const linkedClient = clients.find((client) => client.id === submission.client_id)
  const activeTeam = team.filter((member) => member.status === 'active' && member.role !== 'client')
  const defaultOwner = activeTeam.some((member) => member.id === submission.reviewer_id)
    ? submission.reviewer_id!
    : activeTeam.some((member) => member.id === currentUserId)
      ? currentUserId!
      : activeTeam[0]?.id || ''
  const defaultManager = activeTeam.find(
    (member) => member.id === submission.reviewer_id && (member.role === 'admin' || member.role === 'manager')
  )?.id || ''
  const formTitle = submission.form_templates?.title || 'New Project'
  const subject = submission.company_name || submission.respondent_name || linkedClient?.name

  return {
    clientMode: linkedClient ? 'existing' : 'new',
    clientId: linkedClient?.id || clients[0]?.id || '',
    clientName: submission.company_name || submission.respondent_name || '',
    clientType: 'smb',
    clientContact: submission.respondent_name || '',
    clientEmail: submission.respondent_email || '',
    clientPhone: submission.respondent_phone || '',
    projectName: subject ? `${subject} — ${formTitle}` : formTitle,
    description: `Created from the approved “${formTitle}” submission. Original answers and files remain linked to this project.`,
    projectType: PROJECT_TYPES.includes(formTitle) ? formTitle : 'General',
    priority: 'medium',
    status: 'active',
    phase: '1',
    phaseName: 'Discovery',
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    budget: '',
    currency: 'USD',
    ownerId: defaultOwner,
    managerId: defaultManager,
    teamMemberIds: [],
  }
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised p-3">
      <dt className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value || '—'}</dd>
    </div>
  )
}

export function SubmissionConversionModal({
  submission,
  clients,
  team,
  currentUserId,
  answerCount,
  attachmentCount,
  onClose,
  onConverted,
}: {
  submission: AdminSubmissionRow
  clients: Client[]
  team: Profile[]
  currentUserId: string | null
  answerCount: number
  attachmentCount: number
  onClose: () => void
  onConverted: (project: Project) => void
}) {
  const [step, setStep] = useState<Step>('configure')
  const [draft, setDraft] = useState<Draft>(() => makeDraft(submission, clients, team, currentUserId))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStep('configure')
    setDraft(makeDraft(submission, clients, team, currentUserId))
    setError('')
  }, [submission, clients, team, currentUserId])

  const activeTeam = useMemo(
    () => team.filter((member) => member.status === 'active' && member.role !== 'client'),
    [team]
  )
  const selectedClient = clients.find((client) => client.id === draft.clientId)
  const owner = activeTeam.find((member) => member.id === draft.ownerId)
  const manager = activeTeam.find((member) => member.id === draft.managerId)
  const selectedTeam = activeTeam.filter((member) => draft.teamMemberIds.includes(member.id))

  const validate = (): string | null => {
    if (draft.clientMode === 'existing' && !draft.clientId) return 'Select an existing client.'
    if (draft.clientMode === 'new' && !draft.clientName.trim()) return 'Enter the new client name.'
    if (!draft.projectName.trim()) return 'Enter a project name.'
    if (!draft.projectType) return 'Select a project type.'
    if (!draft.ownerId) return 'Select a project owner.'
    const phase = Number(draft.phase)
    if (!Number.isInteger(phase) || phase < 1 || phase > 10) return 'Project phase must be between 1 and 10.'
    if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) {
      return 'The deadline cannot be before the start date.'
    }
    if (draft.budget && Number(draft.budget) < 0) return 'Budget cannot be negative.'
    if (!/^[a-zA-Z]{3}$/.test(draft.currency.trim())) return 'Currency must be a 3-letter code.'
    return null
  }

  const reviewConversion = (event: React.FormEvent) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStep('confirm')
  }

  const createProject = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setStep('configure')
      return
    }

    const input: SubmissionProjectConversionInput = {
      submissionId: submission.id,
      clientId: draft.clientMode === 'existing' ? draft.clientId : null,
      newClient: draft.clientMode === 'new'
        ? {
            name: draft.clientName.trim(),
            type: draft.clientType,
            contact_person: draft.clientContact.trim() || null,
            email: draft.clientEmail.trim() || null,
            phone: draft.clientPhone.trim() || null,
          }
        : null,
      projectName: draft.projectName.trim(),
      description: draft.description.trim() || null,
      projectType: draft.projectType,
      priority: draft.priority,
      status: draft.status,
      phase: Number(draft.phase),
      phaseName: draft.phaseName.trim() || null,
      startDate: draft.startDate || null,
      dueDate: draft.dueDate || null,
      budget: draft.budget ? Number(draft.budget) : null,
      currency: draft.currency.trim().toUpperCase(),
      ownerId: draft.ownerId,
      managerId: draft.managerId || null,
      teamMemberIds: draft.teamMemberIds,
    }

    setSaving(true)
    setError('')
    const result = await convertSubmissionToProject(input)
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error || 'The project could not be created.')
      return
    }
    onConverted(result.data)
  }

  const toggleTeamMember = (memberId: string) => {
    setDraft((current) => ({
      ...current,
      teamMemberIds: current.teamMemberIds.includes(memberId)
        ? current.teamMemberIds.filter((id) => id !== memberId)
        : [...current.teamMemberIds, memberId],
    }))
  }

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      maxWidthClassName="max-w-4xl"
      title={step === 'configure' ? 'Convert Submission to Project' : 'Confirm Project Conversion'}
      description={step === 'configure'
        ? 'Select or create the client, configure the project, then assign its owner and initial team.'
        : 'Review every value below. Creating the project permanently marks this submission as Converted.'}
    >
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}

      {step === 'configure' ? (
        <form onSubmit={reviewConversion} className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {['Qualified / Approved', 'Client', 'Project', 'Owner & Team', 'Confirmation'].map((label, index) => (
              <span key={label} className={`rounded-full border px-2.5 py-1 ${index === 0 || index === 1
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border text-text-tertiary'}`}>
                {index + 1}. {label}
              </span>
            ))}
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-fg">1. Select or create client</h3>
              <p className="mt-1 text-xs text-text-tertiary">The created project will be linked to this CRM client.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-raised p-1">
              <button type="button" onClick={() => setDraft({ ...draft, clientMode: 'existing' })}
                className={`rounded px-3 py-2 text-xs font-semibold ${draft.clientMode === 'existing' ? 'bg-accent text-accent-foreground' : 'text-text-secondary hover:text-fg'}`}>
                Select existing
              </button>
              <button type="button" onClick={() => setDraft({ ...draft, clientMode: 'new' })}
                className={`rounded px-3 py-2 text-xs font-semibold ${draft.clientMode === 'new' ? 'bg-accent text-accent-foreground' : 'text-text-secondary hover:text-fg'}`}>
                Create new
              </button>
            </div>

            {draft.clientMode === 'existing' ? (
              <label className="block text-xs text-text-secondary">
                Client
                <select required className={`${inputClassName} mt-2`} value={draft.clientId}
                  onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}>
                  <option value="">Select client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.email ? ` — ${client.email}` : ''}</option>)}
                </select>
                {submission.client_id && submission.client_id === draft.clientId && (
                  <span className="mt-1 block text-[11px] text-accent">Linked from the original submission</span>
                )}
              </label>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-text-secondary">Client name<input required className={`${inputClassName} mt-2`} value={draft.clientName} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} /></label>
                <label className="text-xs text-text-secondary">Client type<select className={`${inputClassName} mt-2`} value={draft.clientType} onChange={(e) => setDraft({ ...draft, clientType: e.target.value as Client['type'] })}><option value="enterprise">Enterprise</option><option value="smb">SMB</option><option value="individual">Individual</option><option value="potential">Potential</option></select></label>
                <label className="text-xs text-text-secondary">Contact person<input className={`${inputClassName} mt-2`} value={draft.clientContact} onChange={(e) => setDraft({ ...draft, clientContact: e.target.value })} /></label>
                <label className="text-xs text-text-secondary">E-mail<input type="email" className={`${inputClassName} mt-2`} value={draft.clientEmail} onChange={(e) => setDraft({ ...draft, clientEmail: e.target.value })} /></label>
                <label className="text-xs text-text-secondary sm:col-span-2">Phone<input className={`${inputClassName} mt-2`} value={draft.clientPhone} onChange={(e) => setDraft({ ...draft, clientPhone: e.target.value })} /></label>
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <div>
              <h3 className="text-sm font-semibold text-fg">2. Configure project</h3>
              <p className="mt-1 text-xs text-text-tertiary">Set its type, priority, dates, and initial operational state.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-text-secondary sm:col-span-2 lg:col-span-3">Project name<input required maxLength={200} className={`${inputClassName} mt-2`} value={draft.projectName} onChange={(e) => setDraft({ ...draft, projectName: e.target.value })} /></label>
              <label className="text-xs text-text-secondary">Project type<select required className={`${inputClassName} mt-2`} value={draft.projectType} onChange={(e) => setDraft({ ...draft, projectType: e.target.value })}>{PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label className="text-xs text-text-secondary">Priority<select className={`${inputClassName} mt-2`} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as ProjectPriority })}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs text-text-secondary">Initial status<select className={`${inputClassName} mt-2`} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs text-text-secondary">Phase (1–10)<input required type="number" min="1" max="10" className={`${inputClassName} mt-2`} value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value })} /></label>
              <label className="text-xs text-text-secondary">Phase name<input className={`${inputClassName} mt-2`} value={draft.phaseName} onChange={(e) => setDraft({ ...draft, phaseName: e.target.value })} /></label>
              <label className="text-xs text-text-secondary">Start date<input type="date" className={`${inputClassName} mt-2`} value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
              <label className="text-xs text-text-secondary">Deadline<input type="date" min={draft.startDate || undefined} className={`${inputClassName} mt-2`} value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
              <label className="text-xs text-text-secondary">Budget<input type="number" min="0" step="0.01" className={`${inputClassName} mt-2`} value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} /></label>
              <label className="text-xs text-text-secondary">Currency<input maxLength={3} className={`${inputClassName} mt-2 uppercase`} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></label>
              <label className="text-xs text-text-secondary sm:col-span-2 lg:col-span-3">Description<textarea className={`${inputClassName} mt-2 min-h-24`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <div>
              <h3 className="text-sm font-semibold text-fg">3. Assign owner, manager, and team</h3>
              <p className="mt-1 text-xs text-text-tertiary">Owner and manager are automatically included in project access.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-text-secondary">Project owner<select required className={`${inputClassName} mt-2`} value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}><option value="">Select owner</option>{activeTeam.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}</select></label>
              <label className="text-xs text-text-secondary">Project manager (optional)<select className={`${inputClassName} mt-2`} value={draft.managerId} onChange={(e) => setDraft({ ...draft, managerId: e.target.value })}><option value="">No separate manager</option>{activeTeam.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}</select></label>
            </div>
            <div className="rounded-md border border-border bg-surface-raised p-4">
              <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-accent" /><p className="text-xs font-semibold text-fg">Initial project team</p></div>
              {activeTeam.length === 0 ? <p className="text-xs text-text-tertiary">No active team members are available.</p> : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activeTeam.map((member) => (
                    <label key={member.id} className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface p-2.5 text-xs text-text-secondary hover:border-line-light">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]" checked={draft.teamMemberIds.includes(member.id)} onChange={() => toggleTeamMember(member.id)} />
                      <span>{displayName(member)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-4 text-xs text-cyan-300">
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Submission preserved:</strong> its reference, {answerCount} answer{answerCount === 1 ? '' : 's'}, and {attachmentCount} file{attachmentCount === 1 ? '' : 's'} remain unchanged and linked to the new project.</p></div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose} className={secondaryButtonClassName}>Cancel</button>
            <button type="submit" className={primaryButtonClassName}>Review conversion</button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-300">
            <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">This is the final confirmation.</p><p className="mt-1 text-xs leading-relaxed">One project and, if selected, one client will be created. The submission becomes Converted and cannot be converted again.</p></div></div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryItem label="Project" value={draft.projectName} />
            <SummaryItem label="Client" value={draft.clientMode === 'existing' ? selectedClient?.name || '' : `${draft.clientName} (new)`} />
            <SummaryItem label="Type / Priority" value={`${draft.projectType} · ${PRIORITY_LABELS[draft.priority]}`} />
            <SummaryItem label="Initial state" value={`${STATUS_LABELS[draft.status]} · Phase ${draft.phase}${draft.phaseName ? ` (${draft.phaseName})` : ''}`} />
            <SummaryItem label="Dates" value={`${draft.startDate || 'No start'} → ${draft.dueDate || 'No deadline'}`} />
            <SummaryItem label="Owner / Manager" value={`${owner ? displayName(owner) : '—'}${manager ? ` / ${displayName(manager)}` : ''}`} />
            <SummaryItem label="Initial team" value={selectedTeam.length ? selectedTeam.map((member) => member.full_name || member.email).join(', ') : 'Owner/manager only'} />
            <SummaryItem label="Submission reference" value={submission.id} />
            <SummaryItem label="Preserved response" value={`${answerCount} answers · ${attachmentCount} files`} />
          </dl>

          <div className="rounded-md border border-border bg-surface-raised p-4 text-xs text-text-secondary">
            <div className="flex items-center gap-2 text-fg"><FolderKanban className="h-4 w-4 text-accent" /><strong>Atomic conversion</strong></div>
            <p className="mt-2 leading-relaxed">Client, project, assignments, submission link, and audit event are saved together. If any part fails, none of the conversion is created.</p>
          </div>

          <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
            <button type="button" onClick={() => setStep('configure')} className={secondaryButtonClassName} disabled={saving}><ArrowLeft className="h-4 w-4" /> Back to configuration</button>
            <button type="button" onClick={() => void createProject()} className={primaryButtonClassName} disabled={saving}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? 'Creating project…' : 'Confirm & Create Project'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
