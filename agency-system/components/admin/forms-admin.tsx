'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  ClipboardList,
  Copy,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  createFormTemplate,
  deleteFormTemplate,
  duplicateFormTemplate,
  getFormTemplatesPage,
  updateFormTemplate,
} from '@/lib/supabase/database'
import type { FormStatus, FormTemplateWithCounts } from '@/lib/supabase/types'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, InlineAlert, LoadingState, Modal, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { useConfirm } from '@/components/ui/confirm-dialog'

// ── Admin · Forms ────────────────────────────────────────────────────────────
// Template inventory: create, edit (builder), duplicate, enable/disable,
// archive/restore, and delete — all database-driven, no code involved.

const statusStyles: Record<FormStatus, string> = {
  draft: 'border-border text-text-tertiary',
  published: 'border-green-500/30 bg-green-500/5 text-green-400',
  disabled: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  archived: 'border-border bg-surface-raised text-text-tertiary',
}

const statusLabels: Record<FormStatus, string> = {
  draft: 'Draft',
  published: 'Enabled',
  disabled: 'Disabled',
  archived: 'Archived',
}

function countOf(rows: { count: number }[] | undefined): number {
  return rows?.[0]?.count ?? 0
}

export function FormsAdmin() {
  const confirmDialog = useConfirm()
  const router = useRouter()
  const { can } = useAuth()
  const canManage = can('form.manage')
  const [templates, setTemplates] = useState<FormTemplateWithCounts[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | FormStatus>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '' })
  const [creating, setCreating] = useState(false)

  const debouncedSearch = useDebouncedValue(search, 300)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getFormTemplatesPage({ search: debouncedSearch, status: statusFilter, page, pageSize: 25 })
    setTemplates(result.data)
    setTotal(result.total)
    setError(result.error || '')
    setLoading(false)
  }, [debouncedSearch, statusFilter, page])

  useEffect(() => { void load() }, [load])

  // Search / filter changes start again from page 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter])

  const run = async (id: string, action: () => Promise<{ error: string | null }>, success: string) => {
    setBusy(id)
    setError('')
    setMessage('')
    const result = await action()
    setBusy(null)
    if (result.error) setError(result.error)
    else setMessage(success)
    await load()
  }

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!createForm.title.trim()) return
    setCreating(true)
    setError('')
    const result = await createFormTemplate({ title: createForm.title, description: createForm.description })
    setCreating(false)
    if (result.error || !result.data) {
      setError(result.error || 'Could not create the form.')
      return
    }
    setCreateOpen(false)
    setCreateForm({ title: '', description: '' })
    // Open the builder immediately — the form now exists and needs questions.
    router.push(`/admin/forms/${result.data.id}`)
  }

  const duplicate = (template: FormTemplateWithCounts) =>
    run(template.id, async () => {
      const result = await duplicateFormTemplate(template.id)
      return { error: result.error }
    }, `Duplicated “${template.title}”. The copy starts as a draft.`)

  const toggleEnabled = (template: FormTemplateWithCounts) => {
    const enabling = template.status !== 'published'
    return run(
      template.id,
      async () => updateFormTemplate(template.id, { status: enabling ? 'published' : 'disabled' }).then((r) => ({ error: r.error })),
      enabling ? `“${template.title}” is now live at /f/${template.slug}.` : `“${template.title}” disabled. It no longer accepts responses.`,
    )
  }

  const toggleArchived = (template: FormTemplateWithCounts) => {
    const archiving = template.status !== 'archived'
    return run(
      template.id,
      async () => updateFormTemplate(template.id, { status: archiving ? 'archived' : 'draft' }).then((r) => ({ error: r.error })),
      archiving ? `“${template.title}” archived. Responses are kept.` : `“${template.title}” restored to draft.`,
    )
  }

  const remove = async (template: FormTemplateWithCounts) => {
    const submissions = countOf(template.form_submissions)
    if (submissions > 0) {
      setError(`“${template.title}” has ${submissions} response(s) and cannot be deleted. Archive it instead.`)
      return
    }
    const ok = await confirmDialog({
      title: `Delete “${template.title}”?`,
      description: 'This deletes the form and all of its questions permanently.',
      confirmLabel: 'Delete form',
      tone: 'destructive',
    })
    if (!ok) return
    await run(template.id, async () => deleteFormTemplate(template.id).then((r) => ({ error: r.error })), `Deleted “${template.title}”.`)
  }

  return (
    <Panel
      title="Form templates"
      description="Build and publish Dynamic Forms. Respondents answer them at their public link — every form, question, and option below lives in the database, not in code."
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              placeholder="Search forms…"
              className={`${inputClassName} pl-9`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search forms"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg"
                aria-label="Clear form search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select aria-label="Filter by status" className={`${inputClassName} w-40`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | FormStatus)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="archived">Archived</option>
          </select>
          <p className="text-xs text-text-tertiary">{total} form{total === 1 ? '' : 's'}</p>
        </div>
        {canManage && (
          <button className={primaryButtonClassName} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New form
          </button>
        )}
      </div>

      {(error || message) && (
        <div className="border-b border-border p-5 space-y-3">
          {error && <InlineAlert>{error}</InlineAlert>}
          {message && <InlineAlert tone="success">{message}</InlineAlert>}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading forms…" />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={total ? 'No forms match' : 'No forms yet'}
          description={total ? 'Try different search text or a different status filter.' : 'Create your first form with the button above, add questions in the builder, then enable it and share its public link.'}
          action={!total && canManage ? <button className={primaryButtonClassName} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create the first form</button> : undefined}
        />
      ) : (
        <div className="divide-y divide-border">
          {templates.map((template) => {
            const questions = countOf(template.form_questions)
            const submissions = countOf(template.form_submissions)
            const isBusy = busy === template.id
            return (
              <div key={template.id} className="flex flex-col gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-fg">{template.title}</p>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[template.status]}`}>{statusLabels[template.status]}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-tertiary">
                    {questions} question{questions === 1 ? '' : 's'} · {submissions} response{submissions === 1 ? '' : 's'} · /f/{template.slug}
                  </p>
                  {template.description && <p className="mt-1 line-clamp-1 text-xs text-text-tertiary">{template.description}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isBusy && <LoaderCircle className="h-4 w-4 animate-spin text-accent" />}
                  <button onClick={() => router.push(`/admin/forms/${template.id}`)} className={secondaryButtonClassName}>
                    <Pencil className="h-4 w-4" /> Build
                  </button>
                  <button onClick={() => void duplicate(template)} disabled={isBusy} className={secondaryButtonClassName} title="Duplicate this form with all questions">
                    <Copy className="h-4 w-4" /> Duplicate
                  </button>
                  {template.status !== 'archived' && (
                    <button onClick={() => void toggleEnabled(template)} disabled={isBusy} className={secondaryButtonClassName} title={template.status === 'published' ? 'Disable — stop accepting responses' : 'Enable — publish the form'}>
                      {template.status === 'published' ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {template.status === 'published' ? 'Disable' : 'Enable'}
                    </button>
                  )}
                  {template.status === 'published' && (
                    <a href={`/f/${template.slug}`} target="_blank" rel="noreferrer" className={secondaryButtonClassName} title="Open the public form">
                      <ExternalLink className="h-4 w-4" /> Open
                    </a>
                  )}
                  {canManage && (
                    <button onClick={() => void toggleArchived(template)} disabled={isBusy} className="rounded-md border border-border p-2 text-text-tertiary hover:text-fg" aria-label={template.status === 'archived' ? `Restore ${template.title}` : `Archive ${template.title}`} title={template.status === 'archived' ? 'Restore to draft' : 'Archive (responses are kept)'}>
                      {template.status === 'archived' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    </button>
                  )}
                  {canManage && (
                    <button onClick={() => void remove(template)} disabled={isBusy} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${template.title}`} title={submissions > 0 ? 'Forms with responses cannot be deleted' : 'Delete permanently'}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {templates.length > 0 && (
        <Pagination page={page} pageSize={25} total={total} onChange={(next) => setPage(Math.min(Math.max(1, next), Math.max(1, Math.ceil(total / 25))))} />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a new form" description="The form starts as a draft. Add questions in the builder, then enable it to share its public link.">
        <form className="grid gap-4" onSubmit={submitCreate}>
          <label className="text-xs text-text-secondary">
            Form title
            <input required autoFocus className={`${inputClassName} mt-2`} value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} placeholder="e.g. Social Media Intake" />
          </label>
          <label className="text-xs text-text-secondary">
            Description (optional)
            <textarea className={`${inputClassName} mt-2 min-h-24`} value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} placeholder="Shown to respondents at the top of the form" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClassName} onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className={primaryButtonClassName} disabled={creating}>{creating && <LoaderCircle className="h-4 w-4 animate-spin" />}Create & open builder</button>
          </div>
        </form>
      </Modal>
    </Panel>
  )
}
