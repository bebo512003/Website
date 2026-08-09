'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, ShieldOff, ShieldAlert, LogOut, Home } from 'lucide-react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useAccent } from '@/contexts/accent-context'
import { useAuth } from '@/contexts/auth-context'
import { secondaryButtonClassName, primaryButtonClassName } from '@/components/ui/page'
import { permissionRequiredForPath } from '@/lib/permissions'

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

function RestrictedScreen({ style }: { style: Record<string, string> }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5" style={style}>
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
          <ShieldAlert className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-fg">Permission required</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Your account does not have the permission needed to open this page. If you believe this is a
          mistake, ask an administrator to grant you access.
        </p>
        <Link href="/dashboard" className={`${primaryButtonClassName} mt-6`}>
          <Home className="h-4 w-4" /> Back to dashboard
        </Link>
      </section>
    </main>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { accent } = useAccent()
  const { user, profile, isClient, isDeactivated, isAnonymous, loading, can, permissionsLoaded } = useAuth()
  const isAuthPage = pathname === '/auth'
  const isIntakePage = pathname === '/intake'
  // Published dynamic forms are public respondent pages (/f/<slug>).
  const isPublicFormPage = pathname.startsWith('/f/')
  // The company portfolio is intentionally outside the authenticated staff shell.
  const isPortfolioPage = pathname === '/portfolio' || pathname.startsWith('/portfolio/')
  const isPortalPage = pathname === '/portal'
  // The root is a public Client Landing Page. Staff users are routed to the
  // dashboard so the landing stays client-focused for visitors.
  const isLandingPage = pathname === '/'
  const isStaffDashboard = pathname === '/dashboard'
  // The client landing page, public portfolio, public forms, intake, and the
  // auth screen are the only publicly reachable pages. Everything else sits
  // behind the staff shell.
  const isPublicPage = isLandingPage || isAuthPage || isIntakePage || isPublicFormPage || isPortfolioPage

  useEffect(() => {
    if (loading) return

    // Everything except the public pages requires a signed-in, non-anonymous user.
    if ((!user || isAnonymous) && !isPublicPage) {
      router.replace('/auth')
      return
    }

    if (!user || isAnonymous || !profile) return

    // Signed-in staff members are routed to the dashboard from the root so the
    // landing page always reads as a client-facing entry point.
    if (!isClient && isLandingPage && !isStaffDashboard) {
      router.replace('/dashboard')
      return
    }

    // Client accounts never see staff pages; they are routed to the client portal.
    if (isClient && !isPortalPage && !isIntakePage && !isAuthPage && !isPublicFormPage && !isPortfolioPage && !isLandingPage) {
      router.replace('/portal')
      return
    }

    // Team members have no business on the client portal.
    if (!isClient && isPortalPage) router.replace('/dashboard')
  }, [isAuthPage, isClient, isIntakePage, isAnonymous, isLandingPage, isPortfolioPage, isPortalPage, isPublicFormPage, isPublicPage, isStaffDashboard, loading, profile, router, user])

  const style = {
    ['--accent' as string]: accent.hsl,
    ['--accent-glow' as string]: accent.glow,
  }

  // Public pages render without the workspace shell.
  if (isAuthPage) return <div style={style}>{children}</div>
  if (isIntakePage || isPublicFormPage || isPortfolioPage || isLandingPage) return <div style={style}>{children}</div>

  if (loading || !user || isAnonymous) return <LoadingScreen style={style} />

  // Inactive accounts lose all workspace functionality (RLS blocks the data too).
  if (isDeactivated) return <DeactivatedScreen style={style} />

  if (isPortalPage) {
    if (isClient) return <div style={style}>{children}</div>
    return <LoadingScreen style={style} />
  }

  // Clients are never allowed into the staff shell; redirect is in flight.
  if (isClient) return <LoadingScreen style={style} />

  // Route-level authorization: a user who lacks the permission for a page is blocked
  // from viewing it even if they type the URL directly. RLS enforces the same rule
  // in the database, so this is defence-in-depth, not the only guard.
  const requiredPermission = permissionRequiredForPath(pathname)
  const routeAllowed = !requiredPermission || can(requiredPermission)
  if (permissionsLoaded && !routeAllowed) return <RestrictedScreen style={style} />

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
