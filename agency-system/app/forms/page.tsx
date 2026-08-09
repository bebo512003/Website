'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, ExternalLink, Inbox, Pencil, Settings2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getFormTemplates } from '@/lib/supabase/database'
import type { FormStatus, FormTemplateWithCounts } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

// ── Forms hub (staff) ────────────────────────────────────────────────────────
// Lists the dynamic forms stored in the database. Nothing is hardcoded: an
// admin publishes a form in the builder and it appears here automatically.

const statusStyles: Record<FormStatus, string> = {
  draft: 'border-border text-text-tertiary',
  published: 'border-green-500/30 bg-green-500/5 text-green-400',
  disabled: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  archived: 'border-border bg-surface-raised text-text-tertiary',
}
const statusLabels: Record<FormStatus, string> = { draft: 'Draft', published: 'Enabled', disabled: 'Disabled', archived: 'Archived' }

export default function FormsPage() {
  const { can } = useAuth()
  const canManage = can('form.manage')
  const [templates, setTemplates] = useState<FormTemplateWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getFormTemplates()
    setTemplates(result.data)
    setError(result.error || '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const fillable = templates.filter((template) => template.status === 'published')
  const managedOnly = templates.filter((template) => template.status !== 'published')

  return (
    <Page>
      <PageHeader
        eyebrow="FORMS / DYNAMIC INTAKE"
        title="Forms"
        description="Intake forms stored in the database and rendered dynamically. Open a live form to fill it or share its link; administrators design new forms from Administration → Forms."
        action={canManage ? <Link href="/admin" className={primaryButtonClassName}><Settings2 className="h-4 w-4" /> Manage forms</Link> : undefined}
      />

      {error && <InlineAlert>{error}</InlineAlert>}

      {loading ? (
        <Panel><LoadingState label="Loading forms…" /></Panel>
      ) : templates.length === 0 ? (
        <Panel>
          <EmptyState
            icon={ClipboardList}
            title="No forms available"
            description={canManage
              ? 'Create the first form from Administration → Forms, add questions in the builder, and enable it to share its public link.'
              : 'No live forms yet. An administrator can publish one from Administration → Forms.'}
            action={canManage ? <Link href="/admin" className={primaryButtonClassName}><Settings2 className="h-4 w-4" /> Open administration</Link> : undefined}
          />
        </Panel>
      ) : (
        <>
          <Panel title="Live forms" description="Currently accepting responses. The link can be shared with clients — no account needed.">
            {fillable.length === 0 ? (
              <EmptyState icon={Inbox} title="Nothing live right now" description="Enable a form from the builder to start collecting responses." />
            ) : (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {fillable.map((template) => (
                  <div key={template.id} className="rounded-md border border-border bg-surface-raised p-5 transition hover:border-line-light">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-base font-semibold text-fg">{template.title}</h2>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[template.status]}`}>{statusLabels[template.status]}</span>
                    </div>
                    {template.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-tertiary">{template.description}</p>}
                    <p className="mt-3 font-mono-tech text-[10px] text-text-tertiary">{(template.form_questions?.[0]?.count ?? 0)} QUESTIONS · {(template.form_submissions?.[0]?.count ?? 0)} RESPONSES</p>
                    <div className="mt-4 flex items-center gap-2">
                      <Link href={`/f/${template.slug}`} className={primaryButtonClassName}>Open form <ExternalLink className="h-4 w-4" /></Link>
                      {canManage && <Link href={`/admin/forms/${template.id}`} className={secondaryButtonClassName}><Pencil className="h-4 w-4" /> Edit</Link>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {canManage && managedOnly.length > 0 && (
            <Panel title="Not live" description="Drafts, disabled, and archived forms — visible because you can manage forms.">
              <div className="divide-y divide-border">
                {managedOnly.map((template) => (
                  <div key={template.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <p className="truncate text-sm font-medium text-fg">{template.title}</p>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[template.status]}`}>{statusLabels[template.status]}</span>
                    </div>
                    <Link href={`/admin/forms/${template.id}`} className={secondaryButtonClassName}><Pencil className="h-4 w-4" /> Open builder</Link>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </Page>
  )
}
