'use client'

import { useEffect, useId, useLayoutEffect, useRef } from 'react'

// --------------------------------------------------------------------------
// Accessible dialog primitive
//
// This is the single dialog implementation used across the app. It handles
// the four things a modal has to get right for keyboard and screen-reader
// users:
//
//   1. Focus moves *into* the dialog when it opens (initial focus goes to
//      the first focusable control, or the dialog itself as a fallback).
//   2. Focus is *trapped* inside the dialog while it is open — Tab wraps at
//      the ends and never leaks back into the page behind.
//   3. Escape closes the dialog.
//   4. When the dialog closes, focus is *restored* to the control that
//      opened it, so keyboard users don't get dumped at the top of the page.
//
// It also locks background scroll while open. Lives in its own client-only
// module so the rest of `components/ui/page.tsx` can stay usable from server
// components.
// --------------------------------------------------------------------------

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function useDialogAccessibility(open: boolean, onClose: () => void, dialogRef: React.RefObject<HTMLDivElement | null>) {
  const restoreRef = useRef<HTMLElement | null>(null)

  // Remember what was focused before we opened, so we can restore it on close.
  useLayoutEffect(() => {
    if (!open) return
    restoreRef.current = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ?? null
  }, [open])

  // Move focus into the dialog and lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Prefer the first natural focus target. Falls back to the dialog itself
    // (tabindex=-1) so focus never lands outside the modal.
    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const first = focusables[0]
    if (first) first.focus()
    else dialog.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      // Restore focus to whatever opened the dialog. Guard against the
      // element having been removed from the DOM in the meantime.
      const target = restoreRef.current
      if (target && document.contains(target)) {
        try {
          target.focus()
        } catch {
          /* ignore */
        }
      }
    }
  }, [open, dialogRef])

  // Escape closes, and Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
      if (focusables.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [open, onClose, dialogRef])
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  maxWidthClassName = 'max-w-xl',
  initialFocusRef,
}: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
  maxWidthClassName?: string
  /** Optional element to receive focus when the dialog opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useDialogAccessibility(open, onClose, dialogRef)

  // If a specific initial focus target was requested, honor it after mount.
  useEffect(() => {
    if (!open) return
    const target = initialFocusRef?.current
    if (target) {
      // Defer to the next frame so the general "focus first element" pass in
      // useDialogAccessibility doesn't overwrite the intentional target.
      const raf = requestAnimationFrame(() => target.focus())
      return () => cancelAnimationFrame(raf)
    }
  }, [open, initialFocusRef])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-3 pt-12 sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`max-h-[calc(100dvh-1.5rem)] w-full ${maxWidthClassName} overflow-y-auto rounded-md border border-border bg-surface p-4 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent sm:max-h-[90dvh] sm:p-6`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-lg font-semibold text-fg">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-5 text-text-tertiary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 shrink-0 items-center rounded-md px-2 text-sm text-text-tertiary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
