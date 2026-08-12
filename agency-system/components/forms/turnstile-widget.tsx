'use client'

import { useEffect, useRef, useState } from 'react'

// ── Cloudflare Turnstile widget ──────────────────────────────────────────────
// Renders the Turnstile challenge only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
// configured. When the env var is missing the component renders nothing — the
// form still works, just without the Cloudflare bot-check.
//
// The parent receives the verification token via `onVerify(token)` and should
// pass it to the submit API. `onVerify(null)` is called when the token expires
// or the widget is reset.
//
// Usage:
//   <TurnstileWidget onVerify={setTurnstileToken} />
//
// Env vars:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY — Cloudflare site key (public)
//   TURNSTILE_SECRET_KEY          — Cloudflare secret key (server-only)

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
      reset: (widgetId: string) => void
    }
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function TurnstileWidget({
  onVerify,
  className,
}: {
  onVerify: (token: string | null) => void
  className?: string
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

  // Load the Turnstile script once.
  useEffect(() => {
    if (!siteKey) return
    if (window.turnstile) {
      setReady(true)
      return
    }
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => setReady(true), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [siteKey])

  // Render the widget once the script is loaded.
  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current) return // already rendered

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onVerify(token),
      'expired-callback': () => onVerify(null),
      'error-callback': () => onVerify(null),
      theme: 'auto',
      size: 'invisible',
    })

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [ready, siteKey, onVerify])

  // If no site key, render nothing — the form works without Turnstile.
  if (!siteKey) return null

  return (
    <div
      ref={containerRef}
      className={className}
      // Turnstile injects its own iframe; this div is just the mount point.
    />
  )
}

// The parent can call this to reset the widget after a successful or failed submit.
TurnstileWidget.displayName = 'TurnstileWidget'
