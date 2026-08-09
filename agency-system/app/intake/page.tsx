'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Legacy Intake Redirect ────────────────────────────────────────────────────
// The old /intake page has been deprecated. This route now redirects to the
// new public forms listing at /forms where clients can see all published forms.
// This preserves backward compatibility for any existing bookmarks or links.
export default function IntakeRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the new public forms page
    router.replace('/forms')
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-text-secondary">Redirecting to the new project request forms…</p>
      </div>
    </main>
  )
}
