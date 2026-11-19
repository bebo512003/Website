import Link from 'next/link'
import { ArrowUpRight, FileText } from 'lucide-react'
import type { PublicFormTemplateSummary } from '@/lib/supabase/types'
import { PROJECT_DESK_PATH } from '@/lib/site'
import { secondaryButtonClassName } from '@/components/ui/page'

export function PublishedFormCard({ form, compact = false, lang = 'en', openInDesk = false }: {
  form: PublicFormTemplateSummary
  compact?: boolean
  lang?: 'en' | 'ar'
  openInDesk?: boolean
}) {
  const isAr = lang === 'ar'
  const href = `${openInDesk ? PROJECT_DESK_PATH : `/f/${form.slug}`}${isAr ? '?lang=ar' : ''}`
  const label = openInDesk
    ? (isAr ? 'افتح النموذج من صفحة طلبات المشاريع' : 'Open form in Project desk')
    : (isAr ? `افتح نموذج ${form.title}` : `Open ${form.title}`)
  const questionCount = form.form_questions?.[0]?.count ?? 0
  const countLabel = isAr ? `عدد الأسئلة: ${questionCount.toLocaleString('ar-EG')}` : `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}`
  return (
    <article className="flex min-w-0 flex-col gap-4 border border-border bg-surface p-6 transition-colors hover:border-line-light">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <FileText className="size-5 shrink-0 text-fg" strokeWidth={1.5} aria-hidden="true" />
        <p className="type-label text-text-secondary">{countLabel}</p>
      </div>
      <h3 className={`wrap-anywhere font-semibold text-fg ${compact ? 'text-base' : 'text-lg'}`}><bdi>{form.title}</bdi></h3>
      {form.description && <p className="line-clamp-2 text-sm text-text-secondary"><bdi>{form.description}</bdi></p>}
      <div className="mt-auto pt-2">
        <Link href={href} aria-label={label} className={secondaryButtonClassName}>
          {isAr ? 'افتح النموذج' : 'Open form'} <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
