'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, LogOut, Moon, Search, Sun, User } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { useAuth } from '@/contexts/auth-context'
import { NotificationDropdown } from './notification-dropdown'

export function TopBar() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const { profile, signOut } = useAuth()
  const [query, setQuery] = useState('')

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const value = query.trim()
    router.push(value ? `/projects?q=${encodeURIComponent(value)}` : '/projects')
  }

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (!error) router.replace('/auth')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur-md sm:gap-4 sm:px-6">
      <button type="button" className="inline-flex h-11 w-9 shrink-0 items-center justify-center text-text-secondary md:hidden" onClick={() => router.push('/dashboard')} aria-label="Go to dashboard"><Home className="h-5 w-5" /></button>
      <form onSubmit={submitSearch} className="relative min-w-0 flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" aria-label="Search projects" className="min-h-11 w-full rounded-md border border-border bg-surface-raised py-2 pl-9 pr-3 text-base text-fg outline-none placeholder:text-text-tertiary focus:border-accent sm:text-sm" />
      </form>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <NotificationDropdown />
        <button type="button" onClick={toggleTheme} className="rounded-md border border-border bg-surface p-2 text-text-secondary transition hover:text-fg" aria-label="Toggle color theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <div className="mx-1 hidden h-7 w-px bg-border sm:block" />
        <div className="hidden text-right sm:block"><div className="max-w-40 truncate text-xs font-semibold text-fg">{profile?.full_name || profile?.email}</div><div className="mt-0.5 font-mono-tech text-[8px] text-text-tertiary">{profile?.role || 'employee'}</div></div>
        {profile?.avatar_url ? (
          <button type="button" onClick={() => router.push('/profile')} className="rounded-md border border-border bg-surface p-1 transition hover:text-fg hover:border-accent" aria-label="Open profile">
            {/* Avatar URLs are user-configured and may use any external host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.avatar_url} alt={profile.full_name || 'Profile'} className="h-7 w-7 rounded-full object-cover" />
          </button>
        ) : (
          <button type="button" onClick={() => router.push('/profile')} className="rounded-md border border-border bg-surface p-1.5 text-text-secondary transition hover:text-fg" aria-label="Open profile">
            <User className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={handleSignOut} className="rounded-md border border-border bg-surface p-2 text-text-secondary transition hover:border-red-500/30 hover:text-red-400" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>
    </header>
  )
}
