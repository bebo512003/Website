'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, ShieldOff, LogOut } from 'lucide-react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useAccent } from '@/contexts/accent-context'
import { useAuth } from '@/contexts/auth-context'
import { secondaryButtonClassName } from '@/components/ui/page'

function LoadingScreen({ style, label = 'Loading your workspace…' }: { style: Record<string, string>; label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-bg text-sm text-text-secondary" style={style}>
      <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
      {label}
    </div>
  )
}

function DeactivatedScreen({ style }: { style: Record<string, string> }) {
  const router = useRouter()
  const { signOut } = useAuth()

  const leave = async () => {
    await signOut()
    router.replace('/auth')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5" style={style}>
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
          <ShieldOff className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-fg">Account deactivated</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Your account has been deactivated. You no longer have access to workspace functionality.
          Please contact your administrator if you believe this is a mistake.
        </p>
        <button onClick={() => void leave()} className={`${secondaryButtonClassName} mt-6`}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </section>
    </main>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { accent } = useAccent()
  const { user, profile, isClient, isDeactivated, isAnonymous, loading } = useAuth()
  const isAuthPage = pathname === '/auth'
  const isIntakePage = pathname === '/intake'
  const isPortalPage = pathname === '/portal'

  useEffect(() => {
    if (loading) return

    // Everything except the public pages requires a signed-in, non-anonymous user.
    if ((!user || isAnonymous) && !isAuthPage && !isIntakePage) {
      router.replace('/auth')
      return
    }

    if (!user || isAnonymous || !profile) return

    // Client accounts never see staff pages; they are routed to the client portal.
    if (isClient && !isPortalPage && !isIntakePage && !isAuthPage) {
      router.replace('/portal')
      return
    }

    // Team members have no business on the client portal.
    if (!isClient && isPortalPage) router.replace('/')
  }, [isAuthPage, isClient, isIntakePage, isAnonymous, isPortalPage, loading, profile, router, user])

  const style = {
    ['--accent' as string]: accent.hsl,
    ['--accent-glow' as string]: accent.glow,
  }

  // Public pages render without the workspace shell.
  if (isAuthPage) return <div style={style}>{children}</div>
  if (isIntakePage) return <div style={style}>{children}</div>

  if (loading || !user || isAnonymous) return <LoadingScreen style={style} />

  // Inactive accounts lose all workspace functionality (RLS blocks the data too).
  if (isDeactivated) return <DeactivatedScreen style={style} />

  if (isPortalPage) {
    if (isClient) return <div style={style}>{children}</div>
    return <LoadingScreen style={style} />
  }

  // Clients are never allowed into the staff shell; redirect is in flight.
  if (isClient) return <LoadingScreen style={style} />

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg" style={style}>
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
