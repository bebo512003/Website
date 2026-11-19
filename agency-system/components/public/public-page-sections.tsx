import type { ReactNode, Ref } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { primaryButtonClassName } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import styles from './public-page-sections.module.css'
import { PublicLink } from './public-link'

type BackLink = { href: string; label: string }

export const publicContentClassName = 'site-container py-10 sm:py-12 lg:py-16'
export const publicPanelClassName = 'border border-border bg-surface'

export function PublicEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('type-label flex items-center gap-3 text-text-secondary', className)}>
      <span className="h-px w-6 shrink-0 bg-accent" aria-hidden="true" /> {children}
    </p>
  )
}

export function PublicBackLink({ href, label, className }: BackLink & { className?: string }) {
  return (
    <PublicLink href={href} className={cn('inline-flex min-h-10 w-fit items-center gap-2 text-sm text-text-secondary hover:text-fg hover:underline hover:underline-offset-4', className)}>
      <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" /> {label}
    </PublicLink>
  )
}

export function PublicPageIntro({ eyebrow, title, description, subtitle, actions, backLink, compact = false, titleRef }: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  backLink?: BackLink
  compact?: boolean
  titleRef?: Ref<HTMLHeadingElement>
}) {
  const hasContext = Boolean(description || actions)

  return (
    <section aria-labelledby="public-page-title" className="border-b border-border">
      <div className={cn('site-container', compact ? 'py-8 sm:py-12 lg:py-16' : 'py-12 sm:py-16 lg:py-20')}>
        {backLink && <PublicBackLink {...backLink} className="mb-4 sm:mb-6" />}
        <div className={hasContext ? styles.introGrid : undefined}>
          <div className="min-w-0">
            <PublicEyebrow>{eyebrow}</PublicEyebrow>
            <h1 id="public-page-title" ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="type-h1 mt-4 wrap-break-word text-fg sm:mt-6">
              {title}
            </h1>
            {subtitle && <p className="type-lede mt-2 text-fg">{subtitle}</p>}
          </div>
          {hasContext && (
            <div className="min-w-0">
              {description && <p className="type-lede max-w-xl text-text-secondary">{description}</p>}
              {actions && <div className={cn('flex flex-wrap gap-3', description && 'mt-5')}>{actions}</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function PublicSectionHeading({ eyebrow, title, titleId, action, className }: {
  eyebrow: string
  title: string
  titleId?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <p className="type-label text-accent">{eyebrow}</p>
        <h2 id={titleId} className="type-h2 mt-3">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/** The task comes first on narrow screens; related help sits alongside it when there is room. */
export function PublicWorkArea({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className={cn(publicContentClassName, styles.workArea)}>
      <div className="min-w-0">{children}</div>
      <div className="min-w-0">{aside}</div>
    </div>
  )
}

export function PublicNote({ eyebrow, title, children, action }: {
  eyebrow: string
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <aside className="border-t border-border pt-5">
      <PublicEyebrow>{eyebrow}</PublicEyebrow>
      <h2 className="mt-3 text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">{children}</p>
      {action && <div className="mt-4 flex flex-wrap gap-3">{action}</div>}
    </aside>
  )
}

export function ProjectInquiry({ action }: { action?: ReactNode }) {
  return (
    <section className="bg-surface py-12 sm:py-16">
      <div className="site-container flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="type-label text-text-secondary">Project inquiries</p>
          <h2 className="type-h2 mt-3">Structure, not just style.</h2>
          <p className="mt-3 text-text-secondary">Tell me what you’re building and what it needs to do.</p>
        </div>
        {action ?? <Link href="/forms" className={primaryButtonClassName}>Request a project <ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </section>
  )
}
