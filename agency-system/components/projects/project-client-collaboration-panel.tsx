'use client'

import { useMemo, useState } from 'react'
import {
  EyeOff, Lock, MessageSquare, Send, Share2, Shield, UserRound,
} from 'lucide-react'
import {
  addClientVisibleMessage,
  addProjectComment,
  shareProjectFileWithClient,
  unshareProjectFileWithClient,
} from '@/lib/supabase/database'
import type {
  ClientApproval,
  ClientMessageWithAuthor,
  ClientSharedFileWithFile,
  CommentWithAuthor,
  FileItem,
} from '@/lib/supabase/types'
import { formatBytes } from '@/lib/storage-config'
import {
  EmptyState, InlineAlert, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName,
} from '@/components/ui/page'

export function ProjectClientCollaborationPanel({
  projectId,
  projectFiles,
  sharedFiles,
  clientMessages,
  clientApprovals,
  internalComments,
  canCollaborate,
  onChanged,
}: {
  projectId: string
  projectFiles: FileItem[]
  sharedFiles: ClientSharedFileWithFile[]
  clientMessages: ClientMessageWithAuthor[]
  clientApprovals: ClientApproval[]
  internalComments: CommentWithAuthor[]
  canCollaborate: boolean
  onChanged: () => Promise<void>
}) {
  const sharedIds = useMemo(() => new Set(sharedFiles.map((item) => item.file_id)), [sharedFiles])
  const shareable = useMemo(
    () => projectFiles.filter((file) => !sharedIds.has(file.id)),
    [projectFiles, sharedIds],
  )

  const [shareFileId, setShareFileId] = useState('')
  const [clientNote, setClientNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
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

  return (
    <div className="space-y-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <Panel
        title="Files visible to the client"
        description="Only this allow-list (plus delivered package files) appears in the portal. Everything else stays internal."
      >
        <div className="space-y-4 p-5">
          {sharedFiles.length === 0 ? (
            <p className="text-xs text-text-tertiary">No files have been selected for the client yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {sharedFiles.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.file?.name || 'File'}</p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {item.file ? `${formatBytes(item.file.size)} · ${item.file.type}` : 'Shared'}
                      {item.note ? ` — ${item.note}` : ''}
                    </p>
                  </div>
                  {canCollaborate && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-tertiary hover:text-red-400"
                      disabled={saving}
                      onClick={() => void run(
                        () => unshareProjectFileWithClient(projectId, item.file_id),
                        'File removed from the client allow-list.',
                      )}
                    >
                      <EyeOff className="h-3 w-3" /> Unshare
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canCollaborate && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                aria-label="Share a project file with the client"
                className={`${inputClassName} sm:max-w-xs`}
                value={shareFileId}
                onChange={(event) => setShareFileId(event.target.value)}
              >
                <option value="">Share a project file…</option>
                {shareable.map((file) => (
                  <option key={file.id} value={file.id}>{file.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={secondaryButtonClassName}
                disabled={!shareFileId || saving}
                onClick={() => {
                  const id = shareFileId
                  setShareFileId('')
                  void run(() => shareProjectFileWithClient(projectId, id), 'File is now visible in the client portal.')
                }}
              >
                <Share2 className="h-4 w-4" /> Share with client
              </button>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Client-visible conversation"
          description="The client can read every message in this thread. Internal notes belong in the panel next to it."
        >
          <div className="space-y-3 p-5">
            <div className="flex items-start gap-2 rounded-md border border-cyan-500/25 bg-cyan-500/[0.04] px-3 py-2 text-[11px] text-cyan-200/90">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Visible in the client portal. Feedback here notifies the project owner.
            </div>
            {clientMessages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No client messages"
                description="Share a file or reply here when you want the client to see it."
              />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {clientMessages.map((item) => {
                  const fromClient = item.author?.role === 'client'
                  return (
                    <div
                      key={item.id}
                      className={`rounded-md border px-3 py-2 ${fromClient ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface-raised'}`}
                    >
                      <p className="text-[11px] font-semibold text-fg">
                        {item.author?.full_name || item.author?.email || (fromClient ? 'Client' : 'Team')}
                        <span className="ml-2 font-mono-tech text-[9px] uppercase text-text-tertiary">{item.kind}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">{item.body}</p>
                      <p className="mt-1 text-[10px] text-text-tertiary">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  )
                })}
              </div>
            )}
            {canCollaborate && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!clientNote.trim()) return
                  void run(
                    () => addClientVisibleMessage(projectId, clientNote),
                    'Client-visible message posted.',
                    () => setClientNote(''),
                  )
                }}
              >
                <textarea
                  className={`${inputClassName} min-h-20`}
                  placeholder="Reply — the client will see this"
                  value={clientNote}
                  onChange={(event) => setClientNote(event.target.value)}
                />
                <button type="submit" className={primaryButtonClassName} disabled={saving || !clientNote.trim()}>
                  <Send className="h-4 w-4" /> Post to client
                </button>
              </form>
            )}
          </div>
        </Panel>

        <Panel
          title="Internal notes"
          description="Staff only. The client portal cannot read this table — even if someone types the URL."
        >
          <div className="space-y-3 p-5">
            <div className="flex items-start gap-2 rounded-md border border-orange-500/25 bg-orange-500/[0.04] px-3 py-2 text-[11px] text-orange-200/90">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Private to the team. Stored in `comments`, never in `client_messages`.
            </div>
            {internalComments.length === 0 ? (
              <EmptyState
                icon={Shield}
                title="No internal notes"
                description="Use this for reviewer context the client must never see."
              />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {internalComments.map((item) => (
                  <div key={item.id} className="rounded-md border border-border bg-surface-raised px-3 py-2">
                    <p className="text-[11px] font-semibold text-fg">
                      {item.author?.full_name || item.author?.email || 'Team'}
                      <span className="ml-2 font-mono-tech text-[9px] uppercase text-text-tertiary">internal</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">{item.content}</p>
                    <p className="mt-1 text-[10px] text-text-tertiary">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
            {canCollaborate && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!internalNote.trim()) return
                  void run(
                    () => addProjectComment(projectId, internalNote),
                    'Internal note saved. The client cannot see it.',
                    () => setInternalNote(''),
                  )
                }}
              >
                <textarea
                  className={`${inputClassName} min-h-20`}
                  placeholder="Internal note — hidden from the client"
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                />
                <button type="submit" className={secondaryButtonClassName} disabled={saving || !internalNote.trim()}>
                  <Lock className="h-4 w-4" /> Save internal note
                </button>
              </form>
            )}
          </div>
        </Panel>
      </div>

      {clientApprovals.length > 0 && (
        <Panel title="Client decisions" description="Portal-owned approval, revision, and feedback events.">
          <ul className="divide-y divide-border">
            {clientApprovals.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold capitalize">{item.action.replace(/_/g, ' ')}</p>
                  {item.message && <p className="mt-1 text-xs text-text-secondary">{item.message}</p>}
                </div>
                <span className="text-[11px] text-text-tertiary">{new Date(item.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
