import Link from 'next/link'
import { ArrowRight, ArrowUpRight, FileText } from 'lucide-react'
import type { PublicFormTemplateSummary } from '@/lib/supabase/types'

export function PublishedFormCard({
  form,
  compact = false,
}: {
  form: PublicFormTemplateSummary
  compact?: boolean
}) {
  const questionCount = form.form_questions?.[0]?.count ?? 0
  return (
    <article className="group flex flex-col gap-4 rounded-md border border-border bg-surface p-6 transition hover:border-line-light hover:shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <h3 className={`min-w-0 break-words font-semibold text-fg ${compact ? 'text-base' : 'text-lg'}`}>{form.title}</h3>
        <span className="rounded border border-green-500/30 bg-green-500/5 px-1.5 py-0.5 font-mono-tech text-[9px] text-green-400">LIVE</span>
      </div>
      {form.description && <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{form.description}</p>}
      <p className="font-mono-tech text-[10px] text-text-tertiary">
        {questionCount} QUESTIONS · NO ACCOUNT REQUIRED
      </p>
      <Link
        href={`/f/${form.slug}`}
        className={`mt-auto inline-flex items-center gap-2 self-start rounded-md border border-accent bg-accent font-semibold text-accent-foreground transition hover:brightness-110 ${compact ? 'px-4 py-2.5 text-xs' : 'px-5 py-2.5 text-sm'}`}
      >
        <FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Open form {compact ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowRight className="h-4 w-4" />}
      </Link>
    </article>
  )
}
