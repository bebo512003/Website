'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import {
  Modal,
  destructiveButtonClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from './page'

// ---------------------------------------------------------------------------
// Accessible confirmation dialog
//
// This replaces every `window.confirm(...)` call in the app for two reasons:
//
//   1. Consistency: native browser confirms bypass our design system, can't be
//      styled, and read differently on every platform.
//   2. Accessibility: our Modal primitive already handles focus trap, Escape
//      to close, and focus restoration. `window.confirm` blocks the JS thread
//      and, in some browsers, is announced inconsistently to screen readers.
//
// Usage:
//
//     const confirm = useConfirm()
//     const ok = await confirm({
//       title: 'Delete “Acme rebrand”?',
//       description: 'This also deletes its tasks and files.',
//       confirmLabel: 'Delete project',
//       tone: 'destructive',
//     })
//     if (!ok) return
//
// The returned promise resolves with `true` if the user confirmed and `false`
// if they cancelled (including via Escape or the backdrop). Destructive
// confirmations get an explicit red styling and default the initial focus to
// the Cancel button — the safer choice — following the same convention as
// browser save-changes dialogs.
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string
  description?: string
  /** Extra body content (e.g. an itemized list of what will be removed). */
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `destructive` styles the confirm button red and focuses Cancel first. */
  tone?: 'default' | 'destructive'
}

type Resolver = (value: boolean) => void

interface Pending extends ConfirmOptions {
  resolve: Resolver
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const respond = useCallback(
    (value: boolean) => {
      if (!pending) return
      pending.resolve(value)
      setPending(null)
      setBusy(false)
    },
    [pending],
  )

  // Any change of question resets the busy flag.
  useEffect(() => {
    setBusy(false)
  }, [pending])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialogHost pending={pending} onRespond={respond} busy={busy} setBusy={setBusy} />
    </ConfirmContext.Provider>
  )
}

/**
 * Hook that returns a promise-based `confirm(options)` function. Throws if
 * used outside `<ConfirmProvider>` so we notice the wiring bug loudly instead
 * of silently falling through to `window.confirm`.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

function ConfirmDialogHost({
  pending,
  onRespond,
  busy,
  setBusy,
}: {
  pending: Pending | null
  onRespond: (value: boolean) => void
  busy: boolean
  setBusy: (value: boolean) => void
}) {
  // The initial-focus target depends on the tone: destructive dialogs focus
  // Cancel (safe default), everything else focuses Confirm so keyboard users
  // can just press Enter to proceed.
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const isDestructive = pending?.tone === 'destructive'
  const initialFocusRef = isDestructive ? cancelRef : confirmRef

  const handleConfirm = () => {
    // We flip the busy flag purely to disable the buttons while the parent
    // component navigates or triggers a network call. The parent is in charge
    // of hiding the dialog by resolving its own follow-up state.
    setBusy(true)
    onRespond(true)
  }

  return (
    <Modal
      open={Boolean(pending)}
      title={pending?.title ?? ''}
      description={pending?.description}
      onClose={() => onRespond(false)}
      maxWidthClassName="max-w-md"
      initialFocusRef={initialFocusRef}
    >
      {pending?.body && <div className="mb-5 text-sm text-text-secondary">{pending.body}</div>}
      {isDestructive && (
        <div className="mb-5 flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            This action cannot be undone.
          </p>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={cancelRef}
          type="button"
          onClick={() => onRespond(false)}
          className={secondaryButtonClassName}
          disabled={busy}
        >
          {pending?.cancelLabel ?? 'Cancel'}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={handleConfirm}
          className={isDestructive ? destructiveButtonClassName : primaryButtonClassName}
          disabled={busy}
        >
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pending?.confirmLabel ?? (isDestructive ? 'Delete' : 'Confirm')}
        </button>
      </div>
    </Modal>
  )
}
