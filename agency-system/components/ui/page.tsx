import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Modal is a client-only accessible dialog primitive. It's re-exported here so
// every consumer still imports from `@/components/ui/page` for backwards
// compatibility; the actual client-side implementation lives in `./modal`.
export { Modal } from './modal'

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
            <span className="h-px w-7 bg-accent" aria-hidden="true" />
            {eyebrow}
          </div>
        )}
        <h1 className="break-words font-display text-4xl leading-none tracking-tight text-fg sm:text-7xl">
          {title}<span className="text-text-tertiary" aria-hidden="true">.</span>
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
      <span className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-accent/60 via-accent/10 to-transparent" aria-hidden="true" />
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
        <Icon className="h-5 w-5 text-text-tertiary" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-text-tertiary">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-64 items-center justify-center gap-3 text-sm text-text-secondary"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/**
 * InlineAlert is the single primitive for validation errors, status
 * confirmations, and inline informational banners. It is announced to
 * assistive technology automatically: errors go through the assertive live
 * region so a failed save is spoken immediately, while success and info
 * notes use the polite region so they never interrupt what the user is
 * doing.
 */
export function InlineAlert({
  children,
  tone = 'error',
  role: roleProp,
  live,
}: {
  children: React.ReactNode
  tone?: 'error' | 'success' | 'info'
  /** Override the default ARIA role (`alert` for errors, `status` for the rest). */
  role?: 'alert' | 'status' | 'none'
  /** Override the announcement politeness. */
  live?: 'assertive' | 'polite' | 'off'
}) {
  const isError = tone === 'error'
  const role = roleProp ?? (isError ? 'alert' : 'status')
  const ariaLive = live ?? (isError ? 'assertive' : 'polite')
  return (
    <div
      role={role === 'none' ? undefined : role}
      aria-live={ariaLive}
      aria-atomic="true"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        // The palette is tuned for AA contrast on the dark surface: text
        // moves to -300 shades so it clears 4.5:1 against the tinted
        // background.
        tone === 'error' && 'border-red-500/40 bg-red-500/10 text-red-300',
        tone === 'success' && 'border-green-500/40 bg-green-500/10 text-green-300',
        tone === 'info' && 'border-blue-500/40 bg-blue-500/10 text-blue-300',
      )}
    >
      {children}
    </div>
  )
}

export const inputClassName = 'min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-base text-fg outline-none placeholder:text-text-tertiary focus:border-accent focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'
export const primaryButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:border-line-light hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50'
export const destructiveButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50'
