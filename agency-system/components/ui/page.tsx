import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-full bg-bg p-4 pb-28 sm:p-8 md:pb-8', className)}>
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
    <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-7">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-3 flex items-center gap-3 font-mono-tech text-[11px] text-text-tertiary">
            <span className="h-px w-7 bg-accent" />
            {eyebrow}
          </div>
        )}
        <h1 className="break-words font-display text-4xl leading-none tracking-tight text-fg sm:text-7xl">
          {title}<span className="text-text-tertiary">.</span>
        </h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>}
      </div>
      {action && <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">{action}</div>}
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
  maxWidthClassName = 'max-w-xl',
}: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
  maxWidthClassName?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-3 pt-12 sm:items-center sm:p-5" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`max-h-[calc(100dvh-1.5rem)] w-full ${maxWidthClassName} overflow-y-auto rounded-md border border-border bg-surface p-4 shadow-2xl sm:max-h-[90dvh] sm:p-6`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="modal-title" className="break-words text-lg font-semibold text-fg">{title}</h2>
            {description && <p className="mt-1 text-sm leading-5 text-text-tertiary">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="inline-flex min-h-10 shrink-0 items-center px-2 text-sm text-text-tertiary hover:text-fg" aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const inputClassName = 'min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-base text-fg outline-none placeholder:text-text-tertiary focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'
export const primaryButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:border-line-light hover:text-fg disabled:cursor-not-allowed disabled:opacity-50'
