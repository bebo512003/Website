'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Filter,
  FolderPlus,
  History,
  Inbox,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  addFormSubmissionNote,
  assignFormSubmissionReviewer,
  deleteFormSubmissionNote,
  getAdminInboxSubmission,
  getClients,
  getFormFileUrl,
  getFormSubmissionDetails,
  getFormTemplates,
  getSubmissionInboxPage,
  getSubmissionPipelineCounts,
  getTeamMembers,
  updateFormSubmissionStatus,
  type AdminSubmissionRow,
} from '@/lib/supabase/database'
import type {
  FormSubmissionAnswer,
  FormSubmissionAttachment,
  FormSubmissionEvent,
  FormSubmissionNote,
  Client,
  Profile,
  Project,
  SubmissionStatus,
} from '@/lib/supabase/types'
import { formatAnswer } from '@/lib/forms/question-types'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { Pagination } from '@/components/ui/pagination'
import { SubmissionConversionModal } from '@/components/submissions/submission-conversion-modal'
import {
  SUBMISSION_STATUS_DESCRIPTIONS,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUSES,
  submissionEventLabel,
  submissionStatusLabel,
  submissionStatusStyle,
} from '@/lib/submissions'
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  Modal,
  Page,
  PageHeader,
  Panel,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '@/components/ui/page'

type SortMode = 'newest' | 'oldest' | 'status'
type DetailTab = 'answers' | 'notes' | 'activity'

const PAGE_SIZE = 25

type SubmissionDetails = {
  answers: FormSubmissionAnswer[]
  attachments: FormSubmissionAttachment[]
  notes: FormSubmissionNote[]
  events: FormSubmissionEvent[]
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 30) return 'just now'
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours}h ago`
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) return `${diffInDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SubmissionsPage() {
  const { user, can } = useAuth()
  const allowed = can('submission.view')
  const canEdit = can('submission.edit')
  const canAssign = can('submission.assign')
  const canConvert = can('admin.manage')
  const canOpenForm = can('form.manage') || can('form.view')

  const [rows, setRows] = useState<AdminSubmissionRow[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<{ byStatus: Record<string, number>; assignedToMe: number; total: number }>({ byStatus: {}, assignedToMe: 0, total: 0 })
  const [page, setPage] = useState(1)
  const [team, setTeam] = useState<Profile[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [forms, setForms] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned_to_me' | SubmissionStatus>('all')
  const [reviewerFilter, setReviewerFilter] = useState<string>('all')
  const [formFilter, setFormFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortMode>('newest')

  const debouncedSearch = useDebouncedValue(search, 300)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailTabs, setDetailTabs] = useState<Record<string, DetailTab>>({})
  const [detailsCache, setDetailsCache] = useState<Record<string, SubmissionDetails>>({})
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Note creation state per submission
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})
  const [submittingNote, setSubmittingNote] = useState<string | null>(null)

  // Quick Action Modal for Status change with optional note
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [statusModalSubmission, setStatusModalSubmission] = useState<AdminSubmissionRow | null>(null)
  const [targetStatus, setTargetStatus] = useState<SubmissionStatus>('reviewing')
  const [statusNote, setStatusNote] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Deliberate Admin-only conversion workflow.
  const [conversionSubmission, setConversionSubmission] = useState<AdminSubmissionRow | null>(null)

  const loadDetails = useCallback(async (submissionId: string) => {
    setDetailsLoading(true)
    const result = await getFormSubmissionDetails(submissionId)
    setDetailsLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setDetailsCache((cache) => ({ ...cache, [submissionId]: result.data }))
  }, [])

  const refreshCounts = useCallback(async () => {
    const result = await getSubmissionPipelineCounts()
    if (!result.error) setCounts(result.data)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [submissionResult, teamResult, clientResult, formResult, countsResult] = await Promise.all([
      getSubmissionInboxPage({
        search: debouncedSearch,
        status: statusFilter,
        reviewer: reviewerFilter,
        formId: formFilter,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
      getTeamMembers(),
      getClients(),
      getFormTemplates(),
      getSubmissionPipelineCounts(),
    ])
    setRows(submissionResult.data)
    setTotal(submissionResult.total)
    setTeam(teamResult.data)
    setClients(clientResult.data)
    setForms(formResult.data.map((form) => ({ id: form.id, title: form.title })))
    setCounts(countsResult.data)
    setError(submissionResult.error || teamResult.error || clientResult.error || formResult.error || countsResult.error || '')
    setLoading(false)
  }, [debouncedSearch, statusFilter, reviewerFilter, formFilter, sort, page])

  useEffect(() => {
    if (allowed) void load()
    else setLoading(false)
  }, [allowed, load])

  // Search / filter / sort changes start again from page 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, reviewerFilter, formFilter, sort])

  // Handle URL ?submission=<id> parameter — the linked submission may live on
  // any page, so it is fetched directly and pinned to the top of the list.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const subParam = sp.get('submission')
    if (!subParam) return
    void (async () => {
      const result = await getAdminInboxSubmission(subParam)
      if (result.error || !result.data) return
      const linked = result.data
      setRows((current) => (current.some((r) => r.id === subParam) ? current : [linked, ...current]))
      setExpandedId(subParam)
      void loadDetails(subParam)
    })()
  }, [loadDetails])

  const toggle = async (submissionId: string) => {
    if (expandedId === submissionId) {
      setExpandedId(null)
      return
    }
    setExpandedId(submissionId)
    if (!detailsCache[submissionId]) {
      await loadDetails(submissionId)
    }
  }

  const setSubmissionDetailTab = (submissionId: string, tab: DetailTab) => {
    setDetailTabs((prev) => ({ ...prev, [submissionId]: tab }))
  }

  /** True when a row still belongs on the current page after a status edit —
   * mirrors the server-side status filter so edited rows leave immediately. */
  const stillMatchesStatusFilter = (submission: AdminSubmissionRow): boolean => {
    if (statusFilter === 'assigned_to_me') return submission.reviewer_id === user?.id
    if (statusFilter !== 'all') return submission.status === statusFilter
    return true
  }

  const promptStatusChange = (submission: AdminSubmissionRow, status: SubmissionStatus) => {
    setStatusModalSubmission(submission)
    setTargetStatus(status)
    setStatusNote('')
    setStatusModalOpen(true)
  }

  const confirmStatusChange = async () => {
    if (!statusModalSubmission) return
    setUpdatingStatus(true)
    setError('')
    const result = await updateFormSubmissionStatus(statusModalSubmission.id, targetStatus, statusNote)
    setUpdatingStatus(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setStatusModalOpen(false)
    setMessage(
      `Marked “${statusModalSubmission.respondent_name || statusModalSubmission.respondent_email || 'this submission'}” as ${submissionStatusLabel(targetStatus)}.`
    )
    setRows((items) =>
      items.map((item) => (item.id === statusModalSubmission.id ? { ...item, status: targetStatus } : item))
    )
    if (!stillMatchesStatusFilter({ ...statusModalSubmission, status: targetStatus })) {
      setRows((items) => items.filter((item) => item.id !== statusModalSubmission.id))
      setTotal((value) => Math.max(0, value - 1))
    }
    await refreshCounts()
    // Reload submission details if expanded
    if (expandedId === statusModalSubmission.id) {
      await loadDetails(statusModalSubmission.id)
    }
  }

  const directChangeStatus = async (submission: AdminSubmissionRow, status: SubmissionStatus) => {
    const result = await updateFormSubmissionStatus(submission.id, status)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(
      `Marked “${submission.respondent_name || submission.respondent_email || 'this submission'}” as ${submissionStatusLabel(status)}.`
    )
    setRows((items) => items.map((item) => (item.id === submission.id ? { ...item, status } : item)))
    if (!stillMatchesStatusFilter({ ...submission, status })) {
      setRows((items) => items.filter((item) => item.id !== submission.id))
      setTotal((value) => Math.max(0, value - 1))
    }
    await refreshCounts()
    if (expandedId === submission.id) {
      await loadDetails(submission.id)
    }
  }

  const changeReviewer = async (submission: AdminSubmissionRow, reviewerId: string | null, note?: string) => {
    const result = await assignFormSubmissionReviewer(submission.id, reviewerId, note)
    if (result.error) {
      setError(result.error)
      return
    }
    const reviewer = reviewerId ? team.find((member) => member.id === reviewerId) : undefined
    setMessage(
      reviewerId
        ? `Assigned reviewer: ${reviewer?.full_name || reviewer?.email || 'Team member'}.`
        : 'Reviewer unassigned.'
    )
    setRows((items) =>
      items.map((item) => {
        if (item.id !== submission.id) return item
        return {
          ...item,
          reviewer_id: reviewerId,
          reviewer: reviewer
            ? {
                id: reviewer.id,
                full_name: reviewer.full_name,
                email: reviewer.email,
                avatar_url: reviewer.avatar_url,
                job_title: reviewer.job_title,
              }
            : null,
          reviewed_at: reviewerId ? new Date().toISOString() : null,
        }
      })
    )
    await refreshCounts()
    if (expandedId === submission.id) {
      await loadDetails(submission.id)
    }
  }

  const openConversion = async (submission: AdminSubmissionRow) => {
    setError('')
    if (!detailsCache[submission.id]) await loadDetails(submission.id)
    setConversionSubmission(submission)
  }

  const handleConverted = async (project: Project) => {
    if (!conversionSubmission) return
    const convertedSubmissionId = conversionSubmission.id
    setConversionSubmission(null)
    setRows((items) => items.map((item) => item.id === convertedSubmissionId
      ? {
          ...item,
          status: 'converted',
          project_id: project.id,
          client_id: project.client_id,
          converted_at: new Date().toISOString(),
          converted_by: user?.id || null,
        }
      : item))
    setMessage(`Project “${project.name}” created. The submission, answers, and files remain linked as its source.`)
    await Promise.all([loadDetails(convertedSubmissionId), load()])
  }

  const handleAddNote = async (submissionId: string) => {
    const noteText = (noteInputs[submissionId] || '').trim()
    if (!noteText) return
    setSubmittingNote(submissionId)
    setError('')
    const result = await addFormSubmissionNote(submissionId, noteText)
    setSubmittingNote(null)
    if (result.error || !result.data) {
      setError(result.error || 'Failed to save review note.')
      return
    }
    setNoteInputs((prev) => ({ ...prev, [submissionId]: '' }))
    setMessage('Internal review note added.')
    await loadDetails(submissionId)
  }

  const handleDeleteNote = async (submissionId: string, noteId: string) => {
    if (!window.confirm('Delete this internal review note?')) return
    const result = await deleteFormSubmissionNote(noteId)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage('Review note deleted.')
    await loadDetails(submissionId)
  }

  const downloadAttachment = async (attachment: FormSubmissionAttachment) => {
    const result = await getFormFileUrl(attachment.storage_path)
    if (result.error || !result.data) {
      setError(result.error || 'Could not create a download link.')
      return
    }
    window.open(result.data, '_blank', 'noopener')
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (!allowed) {
    return (
      <Page>
        <PageHeader
          eyebrow="SUBMISSIONS / WORKFLOW"
          title="Submission Review Workflow"
          description="Operational inbox and review workflow for public form responses."
        />
        <Panel>
          <EmptyState
            icon={ShieldCheck}
            title="Submission permission required"
            description="Employees cannot read submissions unless an administrator explicitly grants “View submissions”."
          />
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        eyebrow="SUBMISSIONS / REVIEW WORKFLOW"
        title="Submission Review Workflow"
        description="Qualify, review, and evaluate form submissions with internal notes, reviewer assignments, timestamps, and full audit history."
      />

      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      {/* Workflow Summary & Pipeline Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`group rounded-lg border p-3 text-left transition ${
            statusFilter === 'all'
              ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
              : 'border-border bg-surface hover:border-line-light'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-text-tertiary">All Responses</span>
            <Inbox className="h-3.5 w-3.5 text-text-tertiary group-hover:text-fg" />
          </div>
          <p className="mt-2 font-mono-tech text-2xl font-bold text-fg">{counts.total}</p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">Total submissions</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('new')}
          className={`group rounded-lg border p-3 text-left transition ${
            statusFilter === 'new'
              ? 'border-blue-500/60 bg-blue-500/10 shadow-sm ring-1 ring-blue-500'
              : 'border-border bg-surface hover:border-blue-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-blue-400">Needs Review</span>
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          </div>
          <p className="mt-2 font-mono-tech text-2xl font-bold text-blue-400">{counts.byStatus['new'] || 0}</p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">New submissions</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('reviewing')}
          className={`group rounded-lg border p-3 text-left transition ${
            statusFilter === 'reviewing'
              ? 'border-amber-500/60 bg-amber-500/10 shadow-sm ring-1 ring-amber-500'
              : 'border-border bg-surface hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-amber-400">Under Review</span>
            <Clock className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <p className="mt-2 font-mono-tech text-2xl font-bold text-amber-400">
            {(counts.byStatus['reviewing'] || 0) + (counts.byStatus['need_information'] || 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">Active qualification</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('qualified')}
          className={`group rounded-lg border p-3 text-left transition ${
            statusFilter === 'qualified'
              ? 'border-cyan-500/60 bg-cyan-500/10 shadow-sm ring-1 ring-cyan-500'
              : 'border-border bg-surface hover:border-cyan-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-cyan-400">Qualified</span>
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <p className="mt-2 font-mono-tech text-2xl font-bold text-cyan-400">{counts.byStatus['qualified'] || 0}</p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">Ready to proceed</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`group rounded-lg border p-3 text-left transition ${
            statusFilter === 'approved'
              ? 'border-green-500/60 bg-green-500/10 shadow-sm ring-1 ring-green-500'
              : 'border-border bg-surface hover:border-green-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-green-400">Approved</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          </div>
          <p className="mt-2 font-mono-tech text-2xl font-bold text-green-400">{counts.byStatus['approved'] || 0}</p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">Approved responses</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('rejected')}
          className={`group rounded-lg border p-3 text-left transition ${
            statusFilter === 'rejected'
              ? 'border-red-500/60 bg-red-500/10 shadow-sm ring-1 ring-red-500'
              : 'border-border bg-surface hover:border-red-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-red-400">Declined</span>
            <XCircle className="h-3.5 w-3.5 text-red-400" />
          </div>
          <p className="mt-2 font-mono-tech text-2xl font-bold text-red-400">{counts.byStatus['rejected'] || 0}</p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">Not qualified</p>
        </button>
      </div>

      {/* Toolbar: search · filters · sort */}
      <Panel>
        <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              className={`${inputClassName} pl-9`}
              placeholder="Search reference, name, e-mail, company, form, reviewer…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search submissions"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-text-tertiary" />

            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'assigned_to_me' | SubmissionStatus)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses ({counts.total})</option>
              {user?.id && <option value="assigned_to_me">Assigned to Me ({counts.assignedToMe})</option>}
              {SUBMISSION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SUBMISSION_STATUS_LABELS[status]} ({counts.byStatus[status] || 0})
                </option>
              ))}
            </select>

            <select
              className={inputClassName}
              value={reviewerFilter}
              onChange={(event) => setReviewerFilter(event.target.value)}
              aria-label="Filter by reviewer"
            >
              <option value="all">All reviewers</option>
              {user?.id && <option value="assigned_to_me">Assigned to me</option>}
              <option value="unassigned">Unassigned</option>
              {team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || member.email}
                </option>
              ))}
            </select>

            <select
              className={inputClassName}
              value={formFilter}
              onChange={(event) => setFormFilter(event.target.value)}
              aria-label="Filter by form"
            >
              <option value="all">All forms</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.title}
                </option>
              ))}
            </select>

            <select
              className={inputClassName}
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              aria-label="Sort submissions"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="status">By workflow priority</option>
            </select>
          </div>
        </div>
      </Panel>

      {/* Submissions List */}
      <Panel
        title="Submissions Queue"
        description={`${rows.length} of ${total} submission${
          total === 1 ? '' : 's'
        } — select a submission to review answers, assign reviewers, post internal notes, and track qualification history. Search, filters, and pagination run in the database.`}
      >
        {loading ? (
          <LoadingState label="Loading submission review queue…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No submissions match"
            description="Try clearing your search or filters, or share a published dynamic form link to start collecting and qualifying submissions."
            action={
              search || statusFilter !== 'all' || reviewerFilter !== 'all' || formFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('all')
                    setReviewerFilter('all')
                    setFormFilter('all')
                  }}
                  className={secondaryButtonClassName}
                >
                  Reset all filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
          <div className="divide-y divide-border">
            {rows.map((submission) => {
              const expanded = expandedId === submission.id
              const details = detailsCache[submission.id]
              const reviewer = submission.reviewer
              const isAssignedToMe = !!user?.id && submission.reviewer_id === user.id
              const currentTab = detailTabs[submission.id] || 'answers'
              const noteText = noteInputs[submission.id] || ''
              const isSubmittingThisNote = submittingNote === submission.id

              return (
                <div
                  key={submission.id}
                  id={`submission-${submission.id}`}
                  className={`px-5 py-4 transition ${expanded ? 'bg-accent/[0.03] border-l-2 border-accent' : 'border-l-2 border-transparent'}`}
                >
                  {/* Top row / Item header */}
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <button
                      type="button"
                      onClick={() => void toggle(submission.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-fg hover:text-accent transition">
                            {submission.respondent_name || submission.respondent_email || 'Anonymous respondent'}
                          </p>
                          {submission.reference_number && (
                            <span className="font-mono-tech rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-accent">
                              {submission.reference_number}
                            </span>
                          )}
                          {submission.company_name && (
                            <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-text-secondary">
                              {submission.company_name}
                            </span>
                          )}
                          {isAssignedToMe && (
                            <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono-tech text-[9px] font-semibold text-accent">
                              YOU
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 truncate text-xs text-text-tertiary">
                          {[submission.respondent_email, submission.respondent_phone].filter(Boolean).join(' · ') ||
                            'No contact fields mapped'}
                        </p>
                      </div>
                    </button>

                    {/* Metadata chips + status */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ps-7 lg:ps-0">
                      <div className="min-w-0 text-right sm:text-left">
                        <p className="max-w-[190px] truncate text-xs font-medium text-text-secondary">
                          {submission.form_templates?.title || 'Form'}
                        </p>
                        <p className="mt-0.5 font-mono-tech text-[10px] text-text-tertiary">
                          {formatRelativeTime(submission.submitted_at)}
                        </p>
                      </div>

                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${submissionStatusStyle(
                          submission.status
                        )}`}
                        title={SUBMISSION_STATUS_DESCRIPTIONS[submission.status]}
                      >
                        {submissionStatusLabel(submission.status)}
                      </span>

                      {/* Reviewer badge */}
                      <span
                        className={`inline-flex max-w-[170px] items-center gap-1.5 truncate rounded border px-2 py-0.5 text-xs ${
                          reviewer
                            ? 'border-border bg-surface text-text-secondary'
                            : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
                        }`}
                        title={reviewer ? `Reviewer: ${reviewer.full_name || reviewer.email}` : 'No reviewer assigned'}
                      >
                        <UserRound className="h-3 w-3 shrink-0" />
                        <span className="truncate">{reviewer?.full_name || reviewer?.email || 'Unassigned'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Expanded Workflow Detail Panel */}
                  {expanded && (
                    <div className="mt-4 space-y-4 rounded-lg border border-border bg-surface-raised p-4 sm:p-5">
                      {detailsLoading && !details ? (
                        <LoadingState label="Loading submission review details…" />
                      ) : (
                        <>
                          {/* Contact Info Header */}
                          <div className="grid gap-3 rounded-md border border-border bg-surface p-3.5 sm:grid-cols-2 lg:grid-cols-5">
                            <div>
                              <dt className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Reference</dt>
                              <dd className="mt-0.5 flex items-center gap-1.5 font-mono-tech text-xs font-semibold text-accent">
                                {submission.reference_number || '—'}
                                {submission.reference_number && (
                                  <Link
                                    href={`/track?ref=${encodeURIComponent(submission.reference_number)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-text-tertiary hover:text-accent"
                                    title="View public tracking page"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Form</dt>
                              <dd className="mt-0.5 text-sm font-medium text-fg">{submission.form_templates?.title || 'Unknown Form'}</dd>
                            </div>
                            <div>
                              <dt className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Company</dt>
                              <dd className="mt-0.5 text-sm font-medium text-fg">{submission.company_name || '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">E-mail</dt>
                              <dd className="mt-0.5 break-all text-sm font-medium text-fg">
                                {submission.respondent_email ? (
                                  <a href={`mailto:${submission.respondent_email}`} className="text-accent hover:underline">
                                    {submission.respondent_email}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Submitted At</dt>
                              <dd className="mt-0.5 font-mono-tech text-xs text-text-secondary">
                                {new Date(submission.submitted_at).toLocaleString()}
                              </dd>
                            </div>
                          </div>

                          {/* Review & Qualification Controls (Workflow Actions) */}
                          {(canEdit || canAssign) && (
                            <div className="rounded-md border border-border bg-surface p-4">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                {/* Reviewer Assignment Controls */}
                                <div className="flex flex-wrap items-center gap-3">
                                  {canAssign && (
                                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                                      <span className="font-medium">Assigned Reviewer</span>
                                      <div className="flex items-center gap-2">
                                        <select
                                          className={`${inputClassName} py-1 text-xs`}
                                          value={submission.reviewer_id || ''}
                                          onChange={(event) => void changeReviewer(submission, event.target.value || null)}
                                        >
                                          <option value="">Unassigned</option>
                                          {team.map((member) => (
                                            <option key={member.id} value={member.id}>
                                              {member.full_name || member.email} {member.job_title ? `(${member.job_title})` : ''}
                                            </option>
                                          ))}
                                        </select>
                                        {user?.id && submission.reviewer_id !== user.id && (
                                          <button
                                            type="button"
                                            onClick={() => void changeReviewer(submission, user.id)}
                                            className={secondaryButtonClassName}
                                            title="Assign this submission to me"
                                          >
                                            <UserPlus className="h-3.5 w-3.5 text-accent" />
                                            <span>Assign to me</span>
                                          </button>
                                        )}
                                      </div>
                                    </label>
                                  )}

                                  {/* Direct Status Selector */}
                                  {canEdit && submission.status !== 'converted' && (
                                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                                      <span className="font-medium">Workflow Status</span>
                                      <select
                                        className={`${inputClassName} py-1 text-xs`}
                                        value={submission.status}
                                        onChange={(event) => void directChangeStatus(submission, event.target.value as SubmissionStatus)}
                                      >
                                        {SUBMISSION_STATUSES.filter((status) => status !== 'converted').map((status) => (
                                          <option key={status} value={status}>
                                            {SUBMISSION_STATUS_LABELS[status]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                </div>

                                {/* Quick Qualification Buttons */}
                                {canEdit && submission.status !== 'converted' && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {submission.status === 'new' && (
                                      <button
                                        type="button"
                                        onClick={() => promptStatusChange(submission, 'reviewing')}
                                        className={secondaryButtonClassName}
                                      >
                                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                                        <span>Start Review</span>
                                      </button>
                                    )}

                                    {submission.status !== 'qualified' && submission.status !== 'archived' && (
                                      <button
                                        type="button"
                                        onClick={() => promptStatusChange(submission, 'qualified')}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition"
                                      >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        <span>Qualify</span>
                                      </button>
                                    )}

                                    {submission.status !== 'approved' && submission.status !== 'archived' && (
                                      <button
                                        type="button"
                                        onClick={() => promptStatusChange(submission, 'approved')}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span>Approve</span>
                                      </button>
                                    )}

                                    {canConvert && (submission.status === 'qualified' || submission.status === 'approved') && !submission.project_id && (
                                      <button
                                        type="button"
                                        onClick={() => void openConversion(submission)}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                                      >
                                        <FolderPlus className="h-3.5 w-3.5" />
                                        <span>Convert to Project</span>
                                      </button>
                                    )}

                                    {submission.status !== 'need_information' && submission.status !== 'archived' && (
                                      <button
                                        type="button"
                                        onClick={() => promptStatusChange(submission, 'need_information')}
                                        className={secondaryButtonClassName}
                                      >
                                        <AlertCircle className="h-3.5 w-3.5 text-purple-400" />
                                        <span>Need Info</span>
                                      </button>
                                    )}

                                    {submission.status !== 'rejected' && submission.status !== 'archived' && (
                                      <button
                                        type="button"
                                        onClick={() => promptStatusChange(submission, 'rejected')}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/15 transition"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                        <span>Reject</span>
                                      </button>
                                    )}

                                    {submission.status === 'archived' ? (
                                      <button
                                        type="button"
                                        onClick={() => void directChangeStatus(submission, 'new')}
                                        className={secondaryButtonClassName}
                                      >
                                        <ArchiveRestore className="h-3.5 w-3.5" />
                                        <span>Restore</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => promptStatusChange(submission, 'archived')}
                                        className={secondaryButtonClassName}
                                        title="Archive this submission"
                                      >
                                        <Archive className="h-3.5 w-3.5" />
                                        <span>Archive</span>
                                      </button>
                                    )}

                                    {canOpenForm && (
                                      <Link
                                        href={`/admin/forms/${submission.form_id}?tab=submissions&submission=${submission.id}`}
                                        className={secondaryButtonClassName}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        <span>Form editor</span>
                                      </Link>
                                    )}
                                  </div>
                                )}

                                {submission.status === 'converted' && submission.project_id && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link href={`/projects/${submission.project_id}`} className={primaryButtonClassName}>
                                      <FolderPlus className="h-3.5 w-3.5" />
                                      <span>Open Created Project</span>
                                    </Link>
                                    {canOpenForm && (
                                      <Link href={`/admin/forms/${submission.form_id}?tab=submissions&submission=${submission.id}`} className={secondaryButtonClassName}>
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        <span>Form editor</span>
                                      </Link>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Detail Navigation Tabs */}
                          <div className="flex border-b border-border">
                            <button
                              type="button"
                              onClick={() => setSubmissionDetailTab(submission.id, 'answers')}
                              className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition ${
                                currentTab === 'answers'
                                  ? 'border-accent text-accent font-semibold'
                                  : 'border-transparent text-text-secondary hover:text-fg'
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Answers & Files ({details?.answers?.length || 0})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSubmissionDetailTab(submission.id, 'notes')}
                              className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition ${
                                currentTab === 'notes'
                                  ? 'border-accent text-accent font-semibold'
                                  : 'border-transparent text-text-secondary hover:text-fg'
                              }`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>Internal Notes ({details?.notes?.length || 0})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSubmissionDetailTab(submission.id, 'activity')}
                              className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition ${
                                currentTab === 'activity'
                                  ? 'border-accent text-accent font-semibold'
                                  : 'border-transparent text-text-secondary hover:text-fg'
                              }`}
                            >
                              <History className="h-3.5 w-3.5" />
                              <span>Activity & Audit ({details?.events?.length || 0})</span>
                            </button>
                          </div>

                          {/* Tab 1: Answers & Files */}
                          {currentTab === 'answers' && (
                            <div className="space-y-4 pt-1">
                              <dl className="space-y-3">
                                {[...(details?.answers || [])]
                                  .sort((a, b) => {
                                    const pos = (row: FormSubmissionAnswer) => {
                                      const snap =
                                        row.question_snapshot &&
                                        typeof row.question_snapshot === 'object' &&
                                        !Array.isArray(row.question_snapshot)
                                          ? (row.question_snapshot as Record<string, unknown>)
                                          : {}
                                      return typeof snap.position === 'number' ? snap.position : 0
                                    }
                                    return pos(a) - pos(b)
                                  })
                                  .map((answer) => {
                                    const snapshot =
                                      answer.question_snapshot &&
                                      typeof answer.question_snapshot === 'object' &&
                                      !Array.isArray(answer.question_snapshot)
                                        ? (answer.question_snapshot as Record<string, unknown>)
                                        : {}
                                    const attachments = (details?.attachments || []).filter(
                                      (item) => item.question_id && item.question_id === answer.question_id
                                    )

                                    return (
                                      <div
                                        key={answer.id}
                                        className="grid gap-1 rounded-md border border-border/60 bg-surface/50 p-3 sm:grid-cols-[240px_1fr]"
                                      >
                                        <dt className="text-xs font-medium text-text-tertiary">
                                          {typeof snapshot.label === 'string' ? snapshot.label : 'Question'}
                                        </dt>
                                        <dd className="text-sm text-fg">
                                          {formatAnswer(answer.value)}

                                          {attachments.length > 0 && (
                                            <span className="mt-2.5 flex flex-wrap gap-2">
                                              {attachments.map((attachment) => (
                                                <button
                                                  key={attachment.id}
                                                  type="button"
                                                  onClick={() => void downloadAttachment(attachment)}
                                                  className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent transition"
                                                >
                                                  <FileText className="h-3.5 w-3.5" />
                                                  <span>{attachment.name}</span>
                                                  <Download className="h-3 w-3 text-text-tertiary" />
                                                </button>
                                              ))}
                                            </span>
                                          )}
                                        </dd>
                                      </div>
                                    )
                                  })}
                              </dl>

                              {(details?.attachments?.length ?? 0) > 0 && (
                                <p className="text-[11px] text-text-tertiary">
                                  File attachments are securely fetched via temporary signed links.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Tab 2: Internal Review Notes */}
                          {currentTab === 'notes' && (
                            <div className="space-y-4 pt-1">
                              {/* Add Note Form */}
                              {canEdit && (
                                <div className="rounded-md border border-border bg-surface p-3.5">
                                  <label className="block text-xs font-medium text-text-secondary">
                                    Add Internal Review Note
                                    <textarea
                                      value={noteText}
                                      onChange={(e) =>
                                        setNoteInputs((prev) => ({ ...prev, [submission.id]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                          e.preventDefault()
                                          void handleAddNote(submission.id)
                                        }
                                      }}
                                      placeholder="Write internal review observations, qualification notes, or follow-up tasks (visible to authorized team only)…"
                                      className={`${inputClassName} mt-2 min-h-20 text-xs`}
                                    />
                                  </label>
                                  <div className="mt-2.5 flex items-center justify-between">
                                    <span className="text-[11px] text-text-tertiary">
                                      Tip: Press <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Ctrl+Enter</kbd> to save.
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleAddNote(submission.id)}
                                      disabled={!noteText.trim() || isSubmittingThisNote}
                                      className={primaryButtonClassName}
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      <span>{isSubmittingThisNote ? 'Saving…' : 'Add Note'}</span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Notes List */}
                              {(details?.notes?.length ?? 0) === 0 ? (
                                <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-text-tertiary">
                                  No review notes added yet. Post observations to share context with your team.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {details?.notes?.map((note) => {
                                    const isAuthor = note.author_id === user?.id
                                    const canDeleteNote = isAuthor || can('admin.manage')

                                    return (
                                      <div
                                        key={note.id}
                                        className="group relative rounded-md border border-border bg-surface p-3.5"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                                              {(note.author?.full_name || note.author?.email || 'U')[0].toUpperCase()}
                                            </span>
                                            <div>
                                              <span className="text-xs font-semibold text-fg">
                                                {note.author?.full_name || note.author?.email || 'Team Member'}
                                              </span>
                                              {note.author?.job_title && (
                                                <span className="ms-1.5 text-[10px] text-text-tertiary">
                                                  · {note.author.job_title}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2">
                                            <span
                                              className="font-mono-tech text-[10px] text-text-tertiary"
                                              title={new Date(note.created_at).toLocaleString()}
                                            >
                                              {formatRelativeTime(note.created_at)}
                                            </span>
                                            {canDeleteNote && (
                                              <button
                                                type="button"
                                                onClick={() => void handleDeleteNote(submission.id, note.id)}
                                                className="text-text-tertiary hover:text-red-400 transition"
                                                title="Delete note"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        <p className="mt-2 whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">
                                          {note.note}
                                        </p>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Tab 3: Activity & Audit Trail */}
                          {currentTab === 'activity' && (
                            <div className="space-y-3 pt-1">
                              {(details?.events?.length ?? 0) === 0 ? (
                                <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-text-tertiary">
                                  No audit events recorded.
                                </div>
                              ) : (
                                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
                                  {details?.events?.map((event) => {
                                    return (
                                      <div key={event.id} className="relative">
                                        {/* Dot on timeline */}
                                        <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />

                                        <div className="rounded-md border border-border/70 bg-surface p-3 text-xs">
                                          <div className="flex flex-wrap items-center justify-between gap-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-semibold text-fg">
                                                {event.actor?.full_name || event.actor?.email || 'System / Submitter'}
                                              </span>
                                              <span className="text-text-tertiary">
                                                {submissionEventLabel(event.event_type).toLowerCase()}
                                              </span>
                                            </div>
                                            <span
                                              className="font-mono-tech text-[10px] text-text-tertiary"
                                              title={new Date(event.created_at).toLocaleString()}
                                            >
                                              {formatRelativeTime(event.created_at)}
                                            </span>
                                          </div>

                                          {/* Transition details */}
                                          {event.old_value && event.new_value && (
                                            <div className="mt-1.5 flex items-center gap-1.5 font-mono-tech text-[11px]">
                                              <span className="rounded bg-surface-raised px-1.5 py-0.5 text-text-tertiary line-through">
                                                {submissionStatusLabel(event.old_value) || event.old_value}
                                              </span>
                                              <span className="text-text-tertiary">→</span>
                                              <span className="rounded bg-accent/10 px-1.5 py-0.5 font-semibold text-accent">
                                                {submissionStatusLabel(event.new_value) || event.new_value}
                                              </span>
                                            </div>
                                          )}

                                          {event.note && (
                                            <p className="mt-1.5 italic text-text-secondary leading-relaxed">
                                              “{event.note}”
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={(next) => setPage(Math.min(Math.max(1, next), pageCount))} />
          </>
        )}
      </Panel>

      {conversionSubmission && (
        <SubmissionConversionModal
          submission={conversionSubmission}
          clients={clients}
          team={team}
          currentUserId={user?.id || null}
          answerCount={detailsCache[conversionSubmission.id]?.answers.length || 0}
          attachmentCount={detailsCache[conversionSubmission.id]?.attachments.length || 0}
          onClose={() => setConversionSubmission(null)}
          onConverted={(project) => void handleConverted(project)}
        />
      )}

      {/* Quick Action Status Modal with Optional Reason/Note */}
      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`Change Status to “${submissionStatusLabel(targetStatus)}”`}
        description={`Update the status of ${
          statusModalSubmission?.respondent_name || statusModalSubmission?.respondent_email || 'this submission'
        }.`}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface p-3 text-xs text-text-secondary">
            <span className="font-semibold text-fg">Target Status: </span>
            <span
              className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${submissionStatusStyle(
                targetStatus
              )}`}
            >
              {submissionStatusLabel(targetStatus)}
            </span>
            <p className="mt-1 text-text-tertiary">{SUBMISSION_STATUS_DESCRIPTIONS[targetStatus]}</p>
          </div>

          <label className="block text-xs text-text-secondary">
            Internal Note / Qualification Reason (optional)
            <textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="e.g. Budget confirmed, requested portfolio links, or qualification notes…"
              className={`${inputClassName} mt-2 min-h-24 text-xs`}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStatusModalOpen(false)}
              className={secondaryButtonClassName}
              disabled={updatingStatus}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmStatusChange()}
              disabled={updatingStatus}
              className={primaryButtonClassName}
            >
              {updatingStatus ? 'Updating…' : `Set as ${submissionStatusLabel(targetStatus)}`}
            </button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}
