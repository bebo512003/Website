'use client'

import { useMemo, useState } from 'react'
import {
  Archive, CheckCircle2, CircleAlert, FileCheck2, LoaderCircle, Package, RotateCcw, ShieldAlert, Upload,
} from 'lucide-react'
import {
  addProjectDeliveryFile,
  archiveProject,
  completeProject,
  markDeliveryReady,
  markProjectDelivered,
  prepareProjectDelivery,
  recordInternalClientApproval,
  removeProjectDeliveryFile,
  requestProjectRevision,
  unarchiveProject,
  uploadProjectFile,
} from '@/lib/supabase/database'
import type { FileItem, ProjectDeliveryWithFiles, ProjectWithClient } from '@/lib/supabase/types'
import {
  PROJECT_APPROVAL_STATE_LABELS,
  PROJECT_DELIVERY_STATUS_LABELS,
  approvalStateBadgeClass,
  currentDelivery,
  deliveryReadiness,
  deliveryStatusBadgeClass,
} from '@/lib/project-delivery'
import { validateFile, formatBytes, STORAGE_RULES } from '@/lib/storage-config'
import { InlineAlert, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

export function ProjectDeliveryPanel({
  project,
  deliveries,
  projectFiles,
  canEdit,
  canUpload,
  userId,
  onChanged,
}: {
  project: ProjectWithClient
  deliveries: ProjectDeliveryWithFiles[]
  projectFiles: FileItem[]
  canEdit: boolean
  canUpload: boolean
  userId: string | null
  onChanged: () => Promise<void>
}) {
  const delivery = useMemo(() => currentDelivery(deliveries), [deliveries])
  const deliveryFileIds = useMemo(() => new Set((delivery?.files || []).map((item) => item.file_id)), [delivery])
  const fileCount = delivery?.files.length || 0
  const readiness = useMemo(() => deliveryReadiness(project, delivery, fileCount), [project, delivery, fileCount])
  const addableFiles = useMemo(
    () => projectFiles.filter((file) => !deliveryFileIds.has(file.id)),
    [projectFiles, deliveryFileIds],
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [addFileId, setAddFileId] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [revisionNote, setRevisionNote] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')

  const run = async (action: () => Promise<{ error: string | null }>, success: string) => {
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
    await onChanged()
  }

  const uploadFinal = async (file: File) => {
    if (!userId) return
    const validation = validateFile(file, 'project-files')
    if (!validation.valid) {
      setError(validation.error || 'Invalid file.')
      return
    }
    await run(
      () => uploadProjectFile(project.id, userId, file, { asDelivery: true }),
      `“${file.name}” uploaded and added to the final delivery.`,
    )
  }

  const archived = Boolean(project.archived_at)

  return (
    <Panel
      title="Delivery & closure"
      description="Internal staff workflow: attach final files, mark the delivery, record the client-approval placeholder, then complete and archive. This is not a client portal."
    >
      <div className="space-y-5 p-5">
        {error && <InlineAlert>{error}</InlineAlert>}
        {message && <InlineAlert tone="success">{message}</InlineAlert>}

        {archived && (
          <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-4 text-xs text-orange-200">
            <div className="flex items-start gap-2">
              <Archive className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">This project is archived.</p>
                <p className="mt-1 text-orange-200/80">
                  Archived on {new Date(project.archived_at!).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
                  Status changes and delivery edits are locked until it is restored.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <p className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Package</p>
            {delivery ? (
              <span className={`mt-2 inline-block rounded border px-2 py-1 text-xs font-semibold ${deliveryStatusBadgeClass(delivery.status)}`}>
                v{delivery.version} · {PROJECT_DELIVERY_STATUS_LABELS[delivery.status]}
              </span>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">No package yet</p>
            )}
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <p className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Final files</p>
            <p className="mt-2 text-sm font-semibold">{fileCount} file{fileCount === 1 ? '' : 's'}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <p className="font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">Client approval (internal)</p>
            {delivery ? (
              <span className={`mt-2 inline-block rounded border px-2 py-1 text-xs font-semibold ${approvalStateBadgeClass(delivery.approval_state)}`}>
                {PROJECT_APPROVAL_STATE_LABELS[delivery.approval_state]}
              </span>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">Not recorded</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-cyan-500/25 bg-cyan-500/[0.04] p-4 text-xs text-cyan-200/90">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <p>
              <strong>Two approval paths.</strong> The client can approve (or request a revision) from the portal —
              that writes <em>client_approvals</em> and stamps this package <em>Approved by client</em>. Recording
              approval here is still a staff-only placeholder for off-portal sign-off. Internal comments stay private.
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-fg">Completion checklist</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {[
              ['At least one final delivery file', fileCount >= 1],
              ['Package marked delivered', delivery?.status === 'delivered' || delivery?.status === 'approved'],
              ['Client approval recorded', delivery?.approval_state === 'approved_internally' || delivery?.approval_state === 'approved_by_client'],
              ['Project status is Delivered', project.status === 'delivered' || project.status === 'completed'],
              ['Not archived', !archived],
            ].map(([label, done]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-emerald-400' : 'bg-border'}`} />
                <span className={done ? 'text-text-secondary' : 'text-text-tertiary'}>{label}</span>
              </li>
            ))}
          </ul>
          {readiness.blockers.length > 0 && project.status !== 'completed' && (
            <p className="mt-3 flex items-start gap-2 text-[11px] text-amber-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {readiness.blockers.join(' · ')}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-fg">Final delivery files</p>
          <p className="mt-1 text-[11px] text-text-tertiary">
            Working files stay in Files. Only files added here count toward Ready / Delivered / Completed.
          </p>
          {(delivery?.files.length || 0) === 0 ? (
            <p className="mt-3 text-xs text-text-tertiary">No final delivery files yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-border rounded-md border border-border">
              {delivery!.files.map((link) => (
                <div key={link.file_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{link.file?.name || 'File'}</p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {link.file ? `${formatBytes(link.file.size)} · ${link.file.type}` : 'Attached'}
                    </p>
                  </div>
                  {canEdit && readiness.canChangeFiles && (
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-[11px] text-text-tertiary hover:text-red-400"
                      disabled={saving}
                      onClick={() => void run(() => removeProjectDeliveryFile(project.id, link.file_id), 'File removed from the delivery set.')}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!archived && (canEdit || canUpload) && readiness.canChangeFiles && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                aria-label="Add an existing project file to the delivery"
                className={`${inputClassName} sm:max-w-xs`}
                value={addFileId}
                onChange={(event) => setAddFileId(event.target.value)}
              >
                <option value="">Add an existing project file…</option>
                {addableFiles.map((file) => (
                  <option key={file.id} value={file.id}>{file.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={secondaryButtonClassName}
                disabled={!addFileId || saving}
                onClick={() => {
                  const id = addFileId
                  setAddFileId('')
                  void run(() => addProjectDeliveryFile(project.id, id), 'File added to the final delivery.')
                }}
              >
                <FileCheck2 className="h-4 w-4" /> Add
              </button>
              <label className={`${secondaryButtonClassName} cursor-pointer`}>
                <Upload className="h-4 w-4" />
                Upload final file
                <input
                  type="file"
                  accept={STORAGE_RULES['project-files'].acceptAttribute}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void uploadFinal(file)
                  }}
                />
              </label>
              {!delivery && (
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={saving}
                  onClick={() => void run(() => prepareProjectDelivery(project.id), 'Delivery package prepared.')}
                >
                  <Package className="h-4 w-4" /> Prepare package
                </button>
              )}
            </div>
          )}
        </div>

        {canEdit && !archived && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-xs font-semibold">Mark delivered</p>
              <textarea
                className={`${inputClassName} min-h-20`}
                placeholder="Optional internal handoff note"
                value={deliveryNote}
                onChange={(event) => setDeliveryNote(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={saving || !readiness.canMarkReady}
                  onClick={() => void run(() => markDeliveryReady(project.id), 'Delivery marked ready.')}
                >
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Mark ready
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={saving || !readiness.canMarkDelivered}
                  onClick={() => void run(() => markProjectDelivered(project.id, deliveryNote), 'Project marked delivered.')}
                >
                  Mark delivered
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-xs font-semibold">Internal client-approval placeholder</p>
              <textarea
                className={`${inputClassName} min-h-20`}
                placeholder="How did the client approve? (email, call, meeting…)"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={saving || !delivery}
                  onClick={() => void run(
                    () => recordInternalClientApproval(project.id, approvalNote || 'Waiting for the client.', 'awaiting_client'),
                    'Marked as awaiting client (internal note).',
                  )}
                >
                  Awaiting client
                </button>
                <button
                  type="button"
                  className={primaryButtonClassName}
                  disabled={saving || !delivery || !approvalNote.trim()}
                  onClick={() => void run(
                    () => recordInternalClientApproval(project.id, approvalNote, 'approved_internally'),
                    'Internal approval recorded.',
                  )}
                >
                  Record internal approval
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-xs font-semibold">Revision required</p>
              <textarea
                className={`${inputClassName} min-h-20`}
                placeholder="What needs to change?"
                value={revisionNote}
                onChange={(event) => setRevisionNote(event.target.value)}
              />
              <button
                type="button"
                className={secondaryButtonClassName}
                disabled={saving || !readiness.canRequestRevision || !revisionNote.trim()}
                onClick={() => void run(() => requestProjectRevision(project.id, revisionNote), 'Revision requested. A new delivery package is open.')}
              >
                <RotateCcw className="h-4 w-4" /> Request revision
              </button>
            </div>

            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-xs font-semibold">Complete & archive</p>
              <p className="text-[11px] text-text-tertiary">
                Complete is terminal and is rejected by the database if any checklist item is missing.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primaryButtonClassName}
                  disabled={saving || !readiness.canComplete}
                  onClick={() => {
                    if (!window.confirm('Complete this project? This is a terminal status.')) return
                    void run(() => completeProject(project.id), 'Project completed.')
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" /> Complete project
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={saving || !readiness.canArchive}
                  onClick={() => {
                    if (!window.confirm('Archive this project? It will leave the default project list.')) return
                    void run(() => archiveProject(project.id), 'Project archived.')
                  }}
                >
                  <Archive className="h-4 w-4" /> Archive
                </button>
              </div>
            </div>
          </div>
        )}

        {canEdit && archived && (
          <button
            type="button"
            className={secondaryButtonClassName}
            disabled={saving}
            onClick={() => void run(() => unarchiveProject(project.id), 'Project restored from the archive.')}
          >
            Restore from archive
          </button>
        )}

        {deliveries.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-fg">Previous packages</p>
            <ul className="mt-2 space-y-1 text-[11px] text-text-tertiary">
              {deliveries.filter((item) => item.id !== delivery?.id).map((item) => (
                <li key={item.id}>
                  v{item.version} · {PROJECT_DELIVERY_STATUS_LABELS[item.status]}
                  {item.revision_note ? ` — ${item.revision_note}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  )
}
