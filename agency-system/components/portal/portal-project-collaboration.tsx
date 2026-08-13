'use client'

import { useState } from 'react'
import {
  CheckCircle2, Download, FileCheck2, MessageSquare, Package, RotateCcw, Send,
} from 'lucide-react'
import {
  addClientPortalFeedback,
  approveClientPortalDelivery,
  getFileDownloadUrl,
  requestClientPortalRevision,
} from '@/lib/db'
import type { ClientPortalCollaboration, ClientPortalFile } from '@/lib/supabase/types'
import { formatBytes } from '@/lib/storage-config'
import { EmptyState, InlineAlert, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

export function PortalProjectCollaboration({
  projectId,
  collaboration,
  onChanged,
}: {
  projectId: string
  collaboration: ClientPortalCollaboration
  onChanged: () => Promise<void>
}) {
  const [feedback, setFeedback] = useState('')
  const [revisionNote, setRevisionNote] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const run = async (action: () => Promise<{ error: string | null }>, success: string, clear?: () => void) => {
    setSaving(true)
    setError('')
    setMessage('')
    const result = await action()
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(success)
    clear?.()
    await onChanged()
  }

  const download = async (file: ClientPortalFile) => {
    if (!file.storage_path) {
      setError('This file has no downloadable object.')
      return
    }
    const result = await getFileDownloadUrl(file.storage_path)
    if (result.error || !result.data) {
      setError(result.error || 'Unable to create a download link.')
      return
    }
    const anchor = document.createElement('a')
    anchor.href = result.data
    anchor.download = file.name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  return (
    <div className="space-y-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <section className="relative overflow-hidden rounded-md border border-border bg-surface">
        <span className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-accent/60 via-accent/10 to-transparent" />
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">Shared files & deliverables</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            Only files your agency has selected for you. Working files stay private.
          </p>
        </div>
        {collaboration.files.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="No files shared yet"
            description="When your agency shares a file or delivers a package, it will appear here for download."
          />
        ) : (
          <div className="divide-y divide-border">
            {collaboration.files.map((file) => (
              <div key={file.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">
                    {file.name}
                    {file.source !== 'shared' && (
                      <span className="ml-2 rounded border border-emerald-500/30 px-1.5 py-0.5 font-mono-tech text-[9px] text-emerald-300">
                        DELIVERABLE
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {formatBytes(file.size)} · {file.type} · {new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={!file.storage_path}
                  onClick={() => void download(file)}
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {collaboration.delivery && (
        <section className="relative overflow-hidden rounded-md border border-border bg-surface">
          <span className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-accent/60 via-accent/10 to-transparent" />
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-fg">Latest delivery</h2>
            <p className="mt-1 text-xs text-text-tertiary">
              Approve the package or request a revision. Your agency is notified immediately.
            </p>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Package className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold">Version {collaboration.delivery.version}</span>
              <span className="rounded border border-border px-2 py-0.5 text-[11px] font-semibold capitalize text-text-secondary">
                {collaboration.delivery.status.replace(/_/g, ' ')}
              </span>
              {collaboration.delivery.delivered_at && (
                <span className="text-xs text-text-tertiary">
                  Delivered {new Date(collaboration.delivery.delivered_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {collaboration.delivery.approval_state === 'approved_by_client' && (
              <p className="flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> You approved this delivery.
              </p>
            )}
            {collaboration.delivery.approval_state === 'revision_required' && (
              <p className="text-xs text-amber-300">A revision is in progress. Your team is preparing the next package.</p>
            )}

            {collaboration.can_approve && (
              <div className="space-y-2 rounded-md border border-border p-4">
                <p className="text-xs font-semibold">Approve this delivery</p>
                <textarea
                  className={`${inputClassName} min-h-20`}
                  placeholder="Optional note for your team"
                  value={approvalNote}
                  onChange={(event) => setApprovalNote(event.target.value)}
                />
                <button
                  type="button"
                  className={primaryButtonClassName}
                  disabled={saving}
                  onClick={() => void run(
                    () => approveClientPortalDelivery(projectId, approvalNote),
                    'Delivery approved. Thank you.',
                    () => setApprovalNote(''),
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve delivery
                </button>
              </div>
            )}

            {collaboration.can_request_revision && (
              <div className="space-y-2 rounded-md border border-border p-4">
                <p className="text-xs font-semibold">Request a revision</p>
                <textarea
                  className={`${inputClassName} min-h-20`}
                  placeholder="What needs to change?"
                  value={revisionNote}
                  onChange={(event) => setRevisionNote(event.target.value)}
                />
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={saving || !revisionNote.trim()}
                  onClick={() => void run(
                    () => requestClientPortalRevision(projectId, revisionNote),
                    'Revision requested. Your team has been notified.',
                    () => setRevisionNote(''),
                  )}
                >
                  <RotateCcw className="h-4 w-4" /> Request revision
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="relative overflow-hidden rounded-md border border-border bg-surface">
        <span className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-accent/60 via-accent/10 to-transparent" />
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">Conversation with your team</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            Messages here are visible to you and your agency. Internal staff notes stay private.
          </p>
        </div>
        {collaboration.messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Leave feedback on the work, or wait for your agency to share an update."
          />
        ) : (
          <div className="space-y-3 p-5">
            {collaboration.messages.map((item) => (
              <div
                key={item.id}
                className={`rounded-md border px-4 py-3 ${item.mine ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface-raised'}`}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold text-fg">{item.author_label}</span>
                  <span className="rounded border border-border px-1.5 py-px font-mono-tech text-[9px] uppercase text-text-tertiary">
                    {item.kind}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{item.body}</p>
              </div>
            ))}
          </div>
        )}
        <form
          className="space-y-3 border-t border-border p-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!feedback.trim()) return
            void run(
              () => addClientPortalFeedback(projectId, feedback),
              'Feedback sent. Your project owner has been notified.',
              () => setFeedback(''),
            )
          }}
        >
          <textarea
            className={`${inputClassName} min-h-24`}
            placeholder="Add feedback for your team…"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <button type="submit" className={primaryButtonClassName} disabled={saving || !feedback.trim()}>
            <Send className="h-4 w-4" /> Send feedback
          </button>
        </form>
      </section>
    </div>
  )
}
