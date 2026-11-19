'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, ShieldOff, ShieldAlert, UserX, LogOut, Home } from 'lucide-react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { ForcedPasswordChangeScreen } from './forced-password-change'
import { useTheme } from '@/contexts/theme-context'
import { useAuth } from '@/contexts/auth-context'
import { secondaryButtonClassName, primaryButtonClassName } from '@/components/ui/page'
import { firstAllowedStaffPath, pathAllowed } from '@/lib/permissions'

function LoadingScreen({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-bg text-sm text-text-secondary">
      <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
      {label}
    </div>
  )
}

function DeactivatedScreen() {
  const router = useRouter()
  const { signOut } = useAuth()

  const leave = async () => {
    await signOut()
    router.replace('/auth')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
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

function AccountRemovedScreen() {
  const router = useRouter()
  const { signOut } = useAuth()

  const leave = async () => {
    await signOut()
    router.replace('/auth')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
          <UserX className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-fg">Account removed</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Your workspace account has been removed by an administrator. If you believe this is a
          mistake, contact your team lead.
        </p>
        <button onClick={() => void leave()} className={`${secondaryButtonClassName} mt-6`}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </section>
    </main>
  )
}

function RestrictedScreen({ fallbackHref }: { fallbackHref: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
          <ShieldAlert className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-fg">Permission required</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Your account does not have the permission needed to open this page. If you believe this is a
          mistake, ask an administrator to grant you access.
        </p>
        <Link href={fallbackHref} className={`${primaryButtonClassName} mt-6`}>
          <Home className="h-4 w-4" /> Back to workspace
        </Link>
      </section>
    </main>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme } = useTheme()
  const { user, profile, profileLoaded, isClient, isDeactivated, mustChangePassword, isAnonymous, loading, can, permissionsLoaded } = useAuth()
  const isAuthPage = pathname === '/auth'
  // Published dynamic forms are public respondent pages (/f/<slug>).
  const isPublicFormPage = pathname.startsWith('/f/')
  // The public project desk (/forms) is for new requests and follow-up.
  const isFormsPage = pathname === '/forms'
  // The company portfolio is intentionally outside the authenticated staff shell.
  const isPortfolioPage = pathname === '/portfolio' || pathname.startsWith('/portfolio/')
  const isPortalPage = pathname === '/portal' || pathname.startsWith('/portal/')
  const isLandingPage = pathname === '/'
  const isServicesPage = pathname === '/services'
  // Legacy URLs redirect before reaching the shell. Public portfolio detail
  // pages and the project desk remain outside workspace access gates.
  const isPublicPage = isLandingPage || isAuthPage || isFormsPage || isPublicFormPage || isPortfolioPage || isServicesPage

  useEffect(() => {
    if (loading) return

    // Everything except the public pages requires a signed-in, non-anonymous user.
    if ((!user || isAnonymous) && !isPublicPage) {
      router.replace('/auth')
      return
    }

    if (!user || isAnonymous || !profile) return

    // A plain visit to / takes staff to the dashboard. An explicit section
    // link (including the portfolio editor's /#work) opens the public site.
    if (!isClient && isLandingPage && !window.location.hash) {
      router.replace('/dashboard')
      return
    }

    // Client accounts never see staff pages; they are routed to the client portal.
    if (isClient && !isPortalPage && !isPublicPage) {
      router.replace('/portal')
      return
    }

    // Team members have no business on the client portal.
    if (!isClient && isPortalPage) router.replace('/dashboard')
  }, [isClient, isAnonymous, isLandingPage, isPortalPage, isPublicPage, loading, profile, router, user])

  // PublicPage provides its own landmarks and navigation. Keep the workspace
  // access gates below separate from the public routes.
  if (isPublicPage) return children

  if (loading || !user || isAnonymous) return <LoadingScreen />

  // A signed-in, non-anonymous user whose profile is gone was removed from the
  // workspace (deletion deletes profile + Auth account; this covers live sessions).
  if (profileLoaded && !profile) return <AccountRemovedScreen />

  // Inactive accounts lose all workspace functionality (RLS blocks the data too,
  // and the Auth sign-in ban rejects new logins).
  if (isDeactivated) return <DeactivatedScreen />

  // Accounts still holding their temporary password cannot reach any workspace
  // page — including /profile — until they replace it. The database enforces the
  // same block by withholding all permissions while the flag is pending. Client
  // portal accounts go through the same gate so a temporary password is never
  // left in place.
  if (mustChangePassword) return <ForcedPasswordChangeScreen />

  if (isPortalPage) {
    if (isClient) return <div><SkipToMain /><main id="main-content">{children}</main></div>
    return <LoadingScreen />
  }

  // Clients are never allowed into the staff shell; redirect is in flight.
  if (isClient) return <LoadingScreen />

  // Route-level authorization: a user who lacks every permission accepted by a
  // page is blocked even if they type the URL. RLS enforces the same rule in
  // the database, so this is defence-in-depth, not the only guard.
  const routeAllowed = pathAllowed(pathname, can)
  if (permissionsLoaded && !routeAllowed) {
    return <RestrictedScreen fallbackHref={firstAllowedStaffPath(can)} />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg" data-workspace-theme={theme}>
      <SkipToMain />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>{children}</main>
      </div>
    </div>
  )
}

/**
 * Skip link: the first Tab press on any page reveals a jump-to-content
 * shortcut. Keyboard-only users don't have to Tab through the sidebar and top
 * bar every time they land on a new page. The link is styled entirely in
 * globals.css (`.skip-link`) so the animation and the visible-on-focus rules
 * stay in one place.
 */
function SkipToMain() {
  return (
    <a href="#main-content" className="skip-link">
      Skip to main content
    </a>
  )
}
