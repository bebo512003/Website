import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-full bg-bg p-5 pb-24 sm:p-8 md:pb-8', className)}>
      <div className="mx-auto max-w-7xl space-y-7">{children}</div>
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <div className="mb-3 flex items-center gap-3 font-mono-tech text-[10px] text-text-tertiary">
            <span className="h-px w-7 bg-accent" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-5xl leading-none tracking-tight text-fg sm:text-7xl">
          {title}<span className="text-text-tertiary">.</span>
        </h1>
        {description && <p className="mt-3 max-w-2xl text-sm text-text-secondary">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}

export function Panel({
  children,
  className,
  title,
  description,
}: {
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
}) {
  return (
    <section className={cn('relative overflow-hidden rounded-md border border-border bg-surface', className)}>
      <span className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-accent/60 via-accent/10 to-transparent" />
      {(title || description) && (
        <div className="border-b border-border px-5 py-4">
          {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
          {description && <p className="mt-1 text-xs text-text-tertiary">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
        <Icon className="h-5 w-5 text-text-tertiary" strokeWidth={1.5} />
      </div>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-text-tertiary">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-text-secondary">
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
      {label}
    </div>
  )
}

export function InlineAlert({
  children,
  tone = 'error',
}: {
  children: React.ReactNode
  tone?: 'error' | 'success' | 'info'
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        tone === 'error' && 'border-red-500/30 bg-red-500/5 text-red-400',
        tone === 'success' && 'border-green-500/30 bg-green-500/5 text-green-400',
        tone === 'info' && 'border-blue-500/30 bg-blue-500/5 text-blue-400',
      )}
    >
      {children}
    </div>
  )
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-md border border-border bg-surface p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-fg">{title}</h2>
            {description && <p className="mt-1 text-sm text-text-tertiary">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-tertiary hover:text-fg" aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const inputClassName = 'w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-fg outline-none placeholder:text-text-tertiary focus:border-accent disabled:cursor-not-allowed disabled:opacity-60'
export const primaryButtonClassName = 'inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButtonClassName = 'inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:border-line-light hover:text-fg disabled:cursor-not-allowed disabled:opacity-50'
