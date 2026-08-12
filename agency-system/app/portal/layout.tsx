'use client'

import { useRouter } from 'next/navigation'
import { LogOut, Zap } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { secondaryButtonClassName } from '@/components/ui/page'

/**
 * Shared chrome for the authenticated client portal. Unlike the staff shell, the
 * portal is a single-purpose, invitation-only area: no sidebar, no staff
 * navigation, and nothing from the internal workspace.
 */
export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { signOut } = useAuth()

  const leave = async () => {
    await signOut()
    router.replace('/auth')
  }

  return (
    <main className="min-h-screen bg-bg pb-16">
      <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center border border-line-light bg-surface-raised">
              <Zap className="h-4 w-4 text-accent" />
            </div>
            <span className="font-mono-tech text-[10px] text-text-tertiary">AGENCY OS / CLIENT PORTAL</span>
          </div>
          <button onClick={() => void leave()} className={secondaryButtonClassName}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>

      {children}
    </main>
  )
}
