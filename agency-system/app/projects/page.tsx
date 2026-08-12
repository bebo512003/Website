'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calendar, FolderKanban, LoaderCircle, Pencil, Plus, Search, Trash2, UserRound, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createProjectWithTeam, deleteProject, getClients, getProfiles, getProjects, updateProject } from '@/lib/supabase/database'
import type { Client, Profile, ProjectHealth, ProjectPriority, ProjectStatus, ProjectWithClient } from '@/lib/supabase/types'
import {
  PROJECT_HEALTH_LABELS, PROJECT_HEALTH_ORDER, PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER,
  nextProjectStatuses, projectHealthBadgeClass, projectStatusBadgeClass,
} from '@/lib/project-lifecycle'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

const blankForm = {
  name: '', description: '', client_id: '', type: 'General', status: 'draft' as ProjectStatus,
  priority: 'medium' as ProjectPriority, health: 'on-track' as ProjectHealth,
  progress: '0', phase: '1', phase_name: '', start_date: '', due_date: '', budget: '', currency: 'USD',
  owner_id: '', manager_id: '',
}
type ProjectForm = typeof blankForm

const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
}

function projectToForm(project: ProjectWithClient): ProjectForm {
  return {
    name: project.name,
    description: project.description || '',
    client_id: project.client_id,
    type: project.type,
    status: project.status,
    priority: project.priority,
    health: project.health,
    progress: String(project.progress),
    phase: String(project.phase),
    phase_name: project.phase_name || '',
    start_date: project.start_date || '',
    due_date: project.due_date || '',
    budget: project.budget == null ? '' : String(project.budget),
    currency: project.currency,
    owner_id: project.owner_id || '',
    manager_id: project.manager_id || '',
  }
}

function displayName(member: Pick<Profile, 'full_name' | 'email' | 'job_title'> | null | undefined): string {
  if (!member) return '—'
  return `${member.full_name || member.email}${member.job_title ? ` · ${member.job_title}` : ''}`
}

export default function ProjectsPage() {
  const { can, profile } = useAuth()
  const canCreate = can('project.create')
  const canEdit = can('project.edit')
  const canAssign = can('project.assign')
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | ProjectStatus>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectWithClient | null>(null)
  const [form, setForm] = useState<ProjectForm>(blankForm)
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [projectsResult, clientsResult, teamResult] = await Promise.all([getProjects(), getClients(), getProfiles()])
    setProjects(projectsResult.data)
    setClients(clientsResult.data)
    setTeam(teamResult.data)
    setError(projectsResult.error || clientsResult.error || teamResult.error || '')
    setLoading(false)
  }, [])

  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get('q') || '')
    void load()
  }, [load])

  const activeTeam = useMemo(
    () => team.filter((member) => member.status === 'active' && member.role !== 'client'),
    [team]
  )

  const filtered = useMemo(() => projects.filter((project) => {
    const matchesStatus = status === 'all' || project.status === status
    const search = query.trim().toLowerCase()
    return matchesStatus && (!search || project.name.toLowerCase().includes(search) || project.clients?.name.toLowerCase().includes(search) || project.type.toLowerCase().includes(search))
  }), [projects, query, status])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blankForm, client_id: clients[0]?.id || '', owner_id: profile?.id || '' })
    setTeamMemberIds([])
    setModalOpen(true)
  }

  const openEdit = (project: ProjectWithClient) => {
    setEditing(project)
    setForm(projectToForm(project))
    setTeamMemberIds([])
    setModalOpen(true)
  }

  const statusOptions = useMemo<ProjectStatus[]>(() => {
    if (!editing) return PROJECT_STATUS_ORDER
    return [editing.status, ...nextProjectStatuses(editing.status)]
  }, [editing])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id,
      type: form.type.trim() || 'General',
      status: form.status,
      priority: form.priority,
      health: form.health,
      progress: Number(form.progress),
      phase: Number(form.phase),
      phase_name: form.phase_name.trim() || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      budget: form.budget ? Number(form.budget) : null,
      currency: form.currency.trim().toUpperCase() || 'USD',
      owner_id: form.owner_id || null,
      manager_id: form.manager_id || null,
    }
    const result = editing
      ? await updateProject(editing.id, payload)
      : await createProjectWithTeam(payload, teamMemberIds)
    setSaving(false)
    if (result.error) return setError(result.error)
    setModalOpen(false)
    setMessage(editing ? 'Project updated.' : 'Project created.')
    await load()
  }

  const remove = async (project: ProjectWithClient) => {
    if (!window.confirm(`Delete “${project.name}”? This action cannot be undone.`)) return
    const result = await deleteProject(project.id)
    if (result.error) setError(result.error)
    else {
      setMessage('Project deleted.')
      await load()
    }
  }

  const toggleTeamMember = (memberId: string) => {
    setTeamMemberIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId])
  }

  const counts = useMemo(() => ({
    all: projects.length,
    active: projects.filter((item) => item.status === 'active').length,
    waiting: projects.filter((item) => item.status === 'waiting-for-client').length,
    review: projects.filter((item) => item.status === 'in-review').length,
    completed: projects.filter((item) => item.status === 'completed').length,
  }), [projects])

  return (
    <Page>
      <PageHeader
        eyebrow="PROJECTS / PORTFOLIO"
        title="Projects"
        description="Employees see assigned projects only. Managers and admins can manage the complete portfolio."
        action={canCreate ? <button className={primaryButtonClassName} onClick={openCreate} disabled={!clients.length}><Plus className="h-4 w-4" /> New project</button> : undefined}
      />

      {!clients.length && canCreate && !loading && <InlineAlert tone="info">Create a client before adding a project.</InlineAlert>}
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ['all', 'All projects', counts.all], ['active', 'Active', counts.active], ['waiting-for-client', 'Waiting for client', counts.waiting], ['in-review', 'In review', counts.review], ['completed', 'Completed', counts.completed],
        ] as const).map(([value, label, count]) => (
          <button key={value} onClick={() => setStatus(value)} className={`rounded-md border p-4 text-left transition ${status === value ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-line-light'}`}>
            <span className="font-display text-4xl text-fg">{count}</span><span className="mt-1 block text-xs text-text-tertiary">{label}</span>
          </button>
        ))}
      </div>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" /><input className={`${inputClassName} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, clients, or project types" /></div>
          <div className="flex items-center gap-3">
            <select aria-label="Filter by status" className={`${inputClassName} w-52`} value={status} onChange={(event) => setStatus(event.target.value as 'all' | ProjectStatus)}>
              <option value="all">All statuses</option>
              {PROJECT_STATUS_ORDER.map((value) => <option key={value} value={value}>{PROJECT_STATUS_LABELS[value]}</option>)}
            </select>
            <p className="text-xs text-text-tertiary">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {loading ? <LoadingState label="Loading projects…" /> : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title={projects.length ? 'No projects match your filters' : 'No projects yet'} description={projects.length ? 'Change the search text or status filter.' : canCreate ? 'Create the first project after adding a client.' : 'An administrator or manager must assign a project to your account.'} action={canCreate && clients.length ? <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> New project</button> : undefined} />
        ) : (
          <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => (
              <article key={project.id} className="flex min-h-64 flex-col bg-surface p-5 transition hover:bg-surface-raised">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-2 py-1 font-mono-tech text-[9px] ${projectStatusBadgeClass(project.status)}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
                    <span className={`rounded border px-2 py-1 font-mono-tech text-[9px] ${projectHealthBadgeClass(project.health)}`}>{PROJECT_HEALTH_LABELS[project.health]}</span>
                    <span className="rounded border border-border px-2 py-1 font-mono-tech text-[9px] uppercase text-text-tertiary">{project.priority}</span>
                  </div>
                  {canEdit && <div className="flex gap-1"><button className="rounded border border-border p-1.5 text-text-tertiary hover:text-fg" onClick={() => openEdit(project)} aria-label={`Edit ${project.name}`}><Pencil className="h-3.5 w-3.5" /></button>{can('project.delete') && <button className="rounded border border-border p-1.5 text-text-tertiary hover:text-red-400" onClick={() => void remove(project)} aria-label={`Delete ${project.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>}
                </div>
                <Link href={`/projects/${project.id}`} className="mt-5 block text-lg font-semibold text-fg hover:text-accent">{project.name}</Link>
                <p className="mt-2 line-clamp-2 text-sm text-text-tertiary">{project.description || 'No description provided.'}</p>
                <div className="mt-5 space-y-2 text-xs text-text-secondary">
                  <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0" />{project.clients?.name || 'Client unavailable'}</div>
                  <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 shrink-0" />{project.owner ? `Owner: ${project.owner.full_name || project.owner.email}` : 'No owner'}{project.manager ? ` · ${project.manager.full_name || project.manager.email}` : ''}</div>
                  <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 shrink-0" />{project.due_date ? new Date(`${project.due_date}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'No deadline'}</div>
                </div>
                <div className="mt-auto pt-6"><div className="mb-2 flex justify-between text-xs"><span className="text-text-tertiary">Progress</span><span className="font-semibold text-fg">{project.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent" style={{ width: `${project.progress}%` }} /></div></div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit project' : 'Create project'} description="Project changes are saved directly to Supabase.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <label className="text-xs text-text-secondary sm:col-span-2">Project name<input required className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Client<select required className={`${inputClassName} mt-2`} value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Project type<input required className={`${inputClassName} mt-2`} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Owner<select className={`${inputClassName} mt-2`} value={form.owner_id} onChange={(event) => setForm({ ...form, owner_id: event.target.value })}><option value="">No owner</option>{activeTeam.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Manager<select className={`${inputClassName} mt-2`} value={form.manager_id} onChange={(event) => setForm({ ...form, manager_id: event.target.value })}><option value="">No separate manager</option>{activeTeam.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Status<select className={`${inputClassName} mt-2`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })}>{statusOptions.map((value) => <option key={value} value={value}>{PROJECT_STATUS_LABELS[value]}</option>)}</select>{editing && <span className="mt-1 block text-[10px] text-text-tertiary">Only valid transitions are listed.</span>}</label>
          <label className="text-xs text-text-secondary">Priority<select className={`${inputClassName} mt-2`} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as ProjectPriority })}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Health<select className={`${inputClassName} mt-2`} value={form.health} onChange={(event) => setForm({ ...form, health: event.target.value as ProjectHealth })}>{PROJECT_HEALTH_ORDER.map((value) => <option key={value} value={value}>{PROJECT_HEALTH_LABELS[value]}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Progress (%)<input type="number" min="0" max="100" required className={`${inputClassName} mt-2`} value={form.progress} onChange={(event) => setForm({ ...form, progress: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Phase (1–10)<input type="number" min="1" max="10" required className={`${inputClassName} mt-2`} value={form.phase} onChange={(event) => setForm({ ...form, phase: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Phase name<input className={`${inputClassName} mt-2`} value={form.phase_name} onChange={(event) => setForm({ ...form, phase_name: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Start date<input type="date" className={`${inputClassName} mt-2`} value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Deadline<input type="date" className={`${inputClassName} mt-2`} value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Budget<input type="number" min="0" className={`${inputClassName} mt-2`} value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Currency<input className={`${inputClassName} mt-2`} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-24`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>

          {!editing && canAssign && (
            <div className="rounded-md border border-border bg-surface-raised p-4 sm:col-span-2">
              <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-accent" /><p className="text-xs font-semibold text-fg">Project team</p></div>
              <p className="mb-3 text-[11px] text-text-tertiary">The owner and manager are added automatically. Select additional employees for this project.</p>
              {activeTeam.length === 0 ? <p className="text-xs text-text-tertiary">No active team members are available.</p> : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activeTeam.map((member) => (
                    <label key={member.id} className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface p-2.5 text-xs text-text-secondary hover:border-line-light">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]" checked={teamMemberIds.includes(member.id)} onChange={() => toggleTeamMember(member.id)} />
                      <span>{displayName(member)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={secondaryButtonClassName} onClick={() => setModalOpen(false)}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Create project'}</button></div>
        </form>
      </Modal>
    </Page>
  )
}
