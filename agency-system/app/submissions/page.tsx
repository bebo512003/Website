'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Inbox,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  assignFormSubmissionReviewer,
  getAdminInboxSubmissions,
  getFormFileUrl,
  getFormSubmissionDetails,
  getFormTemplates,
  getTeamMembers,
  updateFormSubmissionStatus,
  type AdminSubmissionRow,
} from '@/lib/supabase/database'
import type { FormSubmissionAnswer, FormSubmissionAttachment, Profile, SubmissionStatus } from '@/lib/supabase/types'
import { formatAnswer } from '@/lib/forms/question-types'
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABELS,
  submissionStatusLabel,
  submissionStatusRank,
  submissionStatusStyle,
} from '@/lib/submissions'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, inputClassName, secondaryButtonClassName } from '@/components/ui/page'

type SortMode = 'newest' | 'oldest' | 'status'

type SubmissionDetails = {
  answers: FormSubmissionAnswer[]
  attachments: FormSubmissionAttachment[]
}

export default function SubmissionsPage() {
  const { can } = useAuth()
  const allowed = can('submission.view')
  const canEdit = can('submission.edit')
  const canAssign = can('submission.assign')
  const canOpenForm = can('form.manage') || can('form.view')

  const [rows, setRows] = useState<AdminSubmissionRow[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [forms, setForms] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SubmissionStatus>('all')
  const [formFilter, setFormFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortMode>('newest')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, SubmissionDetails>>({})
  const [detailsLoading, setDetailsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [submissionResult, teamResult, formResult] = await Promise.all([getAdminInboxSubmissions(), getTeamMembers(), getFormTemplates()])
    setRows(submissionResult.data)
    setTeam(teamResult.data)
    setForms(formResult.data.map((form) => ({ id: form.id, title: form.title })))
    setError(submissionResult.error || teamResult.error || formResult.error || '')
    setLoading(false)
  }, [])

  useEffect(() => {
    if (allowed) void load()
    else setLoading(false)
  }, [allowed, load])

  const toggle = async (submissionId: string) => {
    if (expandedId === submissionId) {
      setExpandedId(null)
      return
    }
    setExpandedId(submissionId)
    if (detailsCache[submissionId]) return
    setDetailsLoading(true)
    const result = await getFormSubmissionDetails(submissionId)
    setDetailsLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setDetailsCache((cache) => ({ ...cache, [submissionId]: result.data }))
  }

  const changeStatus = async (submission: AdminSubmissionRow, status: SubmissionStatus) => {
    const result = await updateFormSubmissionStatus(submission.id, status)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(`Marked “${submission.respondent_name || submission.respondent_email || 'this submission'}” as ${submissionStatusLabel(status)}.`)
    setRows((items) => items.map((item) => (item.id === submission.id ? { ...item, status } : item)))
  }

  const changeReviewer = async (submission: AdminSubmissionRow, reviewerId: string) => {
    const value = reviewerId || null
    const result = await assignFormSubmissionReviewer(submission.id, value)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(value ? 'Reviewer assigned.' : 'Reviewer cleared.')
    setRows((items) => items.map((item) => {
      if (item.id !== submission.id) return item
      const reviewer = value ? team.find((member) => member.id === value) : undefined
      return { ...item, reviewer_id: value, reviewer: reviewer ? { id: reviewer.id, full_name: reviewer.full_name, email: reviewer.email } : null, reviewed_at: value ? new Date().toISOString() : null }
    }))
  }

  const downloadAttachment = async (attachment: FormSubmissionAttachment) => {
    const result = await getFormFileUrl(attachment.storage_path)
    if (result.error || !result.data) {
      setError(result.error || 'Could not create a download link.')
      return
    }
    window.open(result.data, '_blank', 'noopener')
  }

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter((submission) => {
      if (statusFilter !== 'all' && submission.status !== statusFilter) return false
      if (formFilter !== 'all' && submission.form_id !== formFilter) return false
      if (q) {
        const haystack = [
          submission.respondent_name,
          submission.respondent_email,
          submission.respondent_phone,
          submission.company_name,
          submission.form_templates?.title,
          submissionStatusLabel(submission.status),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    const sorted = [...filtered]
    if (sort === 'newest') sorted.sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
    else if (sort === 'oldest') sorted.sort((a, b) => +new Date(a.submitted_at) - +new Date(b.submitted_at))
    else sorted.sort((a, b) => submissionStatusRank(a.status) - submissionStatusRank(b.status) || +new Date(b.submitted_at) - +new Date(a.submitted_at))
    return sorted
  }, [rows, search, statusFilter, formFilter, sort])

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    for (const submission of rows) byStatus[submission.status] = (byStatus[submission.status] || 0) + 1
    return byStatus
  }, [rows])

  if (!allowed) {
    return (
      <Page>
        <PageHeader eyebrow="SUBMISSIONS / INBOX" title="Submissions" description="Operational inbox for every public form response." />
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
        eyebrow="SUBMISSIONS / INBOX"
        title="Submission inbox"
        description="Every public form response, with its form, client, status, owner, and full frozen answer history. Status changes and ownership require the matching permission."
      />
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      {/* Toolbar: search · filters · sort */}
      <Panel>
        <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              className={`${inputClassName} pl-9`}
              placeholder="Search name, e-mail, company, form…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search submissions"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-text-tertiary" />
            <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | SubmissionStatus)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {SUBMISSION_STATUSES.map((status) => (
                <option key={status} value={status}>{SUBMISSION_STATUS_LABELS[status]} ({counts[status] || 0})</option>
              ))}
            </select>
            <select className={inputClassName} value={formFilter} onChange={(event) => setFormFilter(event.target.value)} aria-label="Filter by form">
              <option value="all">All forms</option>
              {forms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
            </select>
            <select className={inputClassName} value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Sort submissions">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="status">By status</option>
            </select>
          </div>
        </div>
      </Panel>

      <Panel
        title="All submissions"
        description={`${visibleRows.length} of ${rows.length} submission${rows.length === 1 ? '' : 's'} — every answer and file shown below reads the frozen per-question snapshot stored at submit time.`}
      >
        {loading ? (
          <LoadingState label="Loading submissions…" />
        ) : visibleRows.length === 0 ? (
          <EmptyState icon={Inbox} title="No submissions match" description="Try clearing the search or filters, or publish a form to start collecting responses." />
        ) : (
          <div className="divide-y divide-border">
            {visibleRows.map((submission) => {
              const expanded = expandedId === submission.id
              const details = detailsCache[submission.id]
              const reviewer = submission.reviewer
              return (
                <div key={submission.id} className={`px-5 py-4 transition ${expanded ? 'bg-accent/[0.04]' : ''}`}>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <button type="button" onClick={() => void toggle(submission.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">
                          {submission.respondent_name || submission.respondent_email || 'Anonymous respondent'}
                        </p>
                        <p className="mt-1 truncate text-xs text-text-tertiary">
                          {[submission.respondent_email, submission.respondent_phone, submission.company_name].filter(Boolean).join(' · ') || 'No mapped contact fields'}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ps-7 lg:ps-0">
                      <div className="min-w-0">
                        <p className="max-w-[180px] truncate text-xs font-medium text-text-secondary">{submission.form_templates?.title || 'Unknown form'}</p>
                        <p className="mt-0.5 font-mono-tech text-[10px] text-text-tertiary">{new Date(submission.submitted_at).toLocaleString()}</p>
                      </div>
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${submissionStatusStyle(submission.status)}`}>
                        {submissionStatusLabel(submission.status)}
                      </span>
                      <span className="inline-flex max-w-[160px] items-center gap-1.5 truncate text-xs text-text-tertiary" title={reviewer?.email || undefined}>
                        <UserRound className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{reviewer?.full_name || reviewer?.email || 'Unassigned'}</span>
                      </span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-4 rounded-md border border-border bg-surface-raised p-4">
                      {detailsLoading && !details ? (
                        <LoadingState label="Loading answers…" />
                      ) : (
                        <>
                          {/* Client info */}
                          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">Form</dt><dd className="mt-0.5 text-sm text-fg">{submission.form_templates?.title || 'Unknown'}</dd></div>
                            <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">Company</dt><dd className="mt-0.5 text-sm text-fg">{submission.company_name || '—'}</dd></div>
                            <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">E-mail</dt><dd className="mt-0.5 break-all text-sm text-fg">{submission.respondent_email || '—'}</dd></div>
                            <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">Phone</dt><dd className="mt-0.5 text-sm text-fg">{submission.respondent_phone || '—'}</dd></div>
                          </dl>

                          {/* Status + reviewer workflow */}
                          {(canEdit || canAssign) && (
                            <div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
                              {canEdit && (
                                <label className="text-xs text-text-secondary">
                                  Status
                                  <select className={`${inputClassName} mt-1`} value={submission.status} onChange={(event) => void changeStatus(submission, event.target.value as SubmissionStatus)}>
                                    {SUBMISSION_STATUSES.map((status) => <option key={status} value={status}>{SUBMISSION_STATUS_LABELS[status]}</option>)}
                                  </select>
                                </label>
                              )}
                              {canAssign && (
                                <label className="text-xs text-text-secondary">
                                  Reviewer / owner
                                  <select className={`${inputClassName} mt-1`} value={submission.reviewer_id || ''} onChange={(event) => void changeReviewer(submission, event.target.value)}>
                                    <option value="">Unassigned</option>
                                    {team.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}
                                  </select>
                                </label>
                              )}
                              <div className="flex flex-1 flex-wrap justify-end gap-2">
                                {canOpenForm && (
                                  <Link href={`/admin/forms/${submission.form_id}?tab=submissions&submission=${submission.id}`} className={secondaryButtonClassName}>
                                    Open in form
                                  </Link>
                                )}
                                {canEdit && (submission.status === 'archived' ? (
                                  <button onClick={() => void changeStatus(submission, 'new')} className={secondaryButtonClassName}><ArchiveRestore className="h-4 w-4" /> Restore</button>
                                ) : (
                                  <button onClick={() => void changeStatus(submission, 'archived')} className={secondaryButtonClassName}><Archive className="h-4 w-4" /> Archive</button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Answers — each shown with its original question snapshot */}
                          <div className="border-t border-border pt-4">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Answers</h3>
                            <dl className="space-y-3">
                              {[...(details?.answers || [])]
                                .sort((a, b) => {
                                  const pos = (row: FormSubmissionAnswer) => {
                                    const snap = row.question_snapshot && typeof row.question_snapshot === 'object' && !Array.isArray(row.question_snapshot) ? row.question_snapshot as Record<string, unknown> : {}
                                    return typeof snap.position === 'number' ? snap.position : 0
                                  }
                                  return pos(a) - pos(b)
                                })
                                .map((answer) => {
                                  const snapshot = answer.question_snapshot && typeof answer.question_snapshot === 'object' && !Array.isArray(answer.question_snapshot)
                                    ? answer.question_snapshot as Record<string, unknown>
                                    : {}
                                  const attachments = (details?.attachments || []).filter((item) => item.question_id && item.question_id === answer.question_id)
                                  return (
                                    <div key={answer.id} className="grid gap-1 sm:grid-cols-[240px_1fr]">
                                      <dt className="text-xs text-text-tertiary">{typeof snapshot.label === 'string' ? snapshot.label : 'Question'}</dt>
                                      <dd className="text-sm text-fg">
                                        {formatAnswer(answer.value)}
                                        {attachments.length > 0 && (
                                          <span className="mt-2 flex flex-wrap gap-2">
                                            {attachments.map((attachment) => (
                                              <button key={attachment.id} onClick={() => void downloadAttachment(attachment)} className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent">
                                                <FileText className="h-3 w-3" /> {attachment.name} <Download className="h-3 w-3" />
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
                              <p className="mt-4 text-[11px] text-text-tertiary">Files open in a new tab via a temporary signed link.</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </Page>
  )
}
