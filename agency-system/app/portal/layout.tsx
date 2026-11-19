'use client'

import { useRouter } from 'next/navigation'
import { ArrowUpRight, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { secondaryButtonClassName } from '@/components/ui/page'
import { NotificationDropdown } from '@/components/layout/notification-dropdown'
import { BrandLockup } from '@/components/public/brand'
import { SITE_CONTACT } from '@/lib/contact'

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
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-20 border-b border-border bg-bg">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <BrandLockup compact />
            <span className="type-label hidden text-text-secondary sm:inline">Client portal</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationDropdown viewAllHref="/portal" />
            <button onClick={() => void leave()} className={secondaryButtonClassName}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </div>

      {children}
      <footer className="border-t border-border px-5 py-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">Need help with your project?</span>
          <a href={SITE_CONTACT.mailto} className="inline-flex items-center gap-2 text-fg hover:underline">
            Email for help <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  )
}
