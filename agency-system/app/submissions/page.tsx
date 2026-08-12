'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Download, FileText, Inbox, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getAllFormSubmissions, getFormFileUrl, getFormSubmissionDetails, updateFormSubmissionStatus } from '@/lib/supabase/database'
import type { FormSubmission, FormSubmissionAnswer, FormSubmissionAttachment } from '@/lib/supabase/types'
import { formatAnswer } from '@/lib/forms/question-types'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, secondaryButtonClassName } from '@/components/ui/page'

type SubmissionRow = FormSubmission & { form_templates?: { title: string; slug: string } | null }

export default function SubmissionsPage() {
  const { can } = useAuth()
  const allowed = can('submission.view')
  const canEdit = can('submission.edit')
  const canOpenForm = can('form.manage') || can('form.view')
  const [rows, setRows] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, { answers: FormSubmissionAnswer[]; attachments: FormSubmissionAttachment[] }>>({})
  const [detailsLoading, setDetailsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getAllFormSubmissions()
    setRows(result.data as SubmissionRow[])
    setError(result.error || '')
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

  const setStatus = async (submission: FormSubmission, status: 'submitted' | 'archived') => {
    const result = await updateFormSubmissionStatus(submission.id, status)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(status === 'archived' ? 'Response archived.' : 'Response restored.')
    await load()
  }

  const downloadAttachment = async (attachment: FormSubmissionAttachment) => {
    const result = await getFormFileUrl(attachment.storage_path)
    if (result.error || !result.data) {
      setError(result.error || 'Could not create a download link.')
      return
    }
    window.open(result.data, '_blank', 'noopener')
  }

  if (!allowed) {
    return (
      <Page>
        <PageHeader eyebrow="SUBMISSIONS" title="Submissions" description="Dynamic Form responses." />
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
        title="Submissions"
        description="Only accounts with View submissions can open this inbox. Client contact details stay hidden from everyone else."
      />
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      <Panel title="Responses" description="Each row is a stored submission. Expanding it reads the same rows RLS already allowed.">
        {loading ? (
          <LoadingState label="Loading submissions…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No submissions yet" description="Published forms will collect responses here." />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((submission) => {
              const expanded = expandedId === submission.id
              const details = detailsCache[submission.id]
              return (
                <div key={submission.id} className="px-5 py-4">
                  <button type="button" onClick={() => void toggle(submission.id)} className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      {expanded ? <ChevronDown className="h-4 w-4 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 text-text-tertiary" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">
                          {submission.respondent_name || submission.respondent_email || 'Anonymous respondent'}
                        </p>
                        <p className="mt-1 truncate text-xs text-text-tertiary">
                          {[submission.form_templates?.title, submission.respondent_email, submission.company_name].filter(Boolean).join(' · ') || 'No mapped contact fields'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ps-7 sm:ps-0">
                      {submission.status === 'archived' && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">archived</span>}
                      <span className="font-mono-tech text-[10px] text-text-tertiary">{new Date(submission.submitted_at).toLocaleString()}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-4 space-y-4 rounded-md border border-border bg-surface-raised p-4">
                      {detailsLoading && !details ? <LoadingState label="Loading answers…" /> : (
                        <>
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
                                  <div key={answer.id} className="grid gap-1 sm:grid-cols-[220px_1fr]">
                                    <dt className="text-xs text-text-tertiary">{typeof snapshot.label === 'string' ? snapshot.label : 'Question'}</dt>
                                    <dd className="text-sm text-fg">
                                      {formatAnswer(answer.value)}
                                      {attachments.length > 0 && (
                                        <span className="mt-1 flex flex-wrap gap-2">
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
                          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                            {canOpenForm && (
                              <Link href={`/admin/forms/${submission.form_id}?tab=submissions&submission=${submission.id}`} className={secondaryButtonClassName}>
                                Open form
                              </Link>
                            )}
                            {canEdit && (submission.status === 'archived'
                              ? <button onClick={() => void setStatus(submission, 'submitted')} className={secondaryButtonClassName}><ArchiveRestore className="h-4 w-4" /> Restore</button>
                              : <button onClick={() => void setStatus(submission, 'archived')} className={secondaryButtonClassName}><Archive className="h-4 w-4" /> Archive response</button>)}
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
