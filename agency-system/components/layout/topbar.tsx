'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Home, LogOut, Moon, Search, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { useAuth } from '@/contexts/auth-context'
import { getNotifications } from '@/lib/supabase/database'

export function TopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { profile, signOut } = useAuth()
  const [query, setQuery] = useState('')
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const result = await getNotifications(50)
      if (active && !result.error) setUnread(result.data.filter((notification) => !notification.read_at).length)
    }
    void refresh()
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('agency-notifications-changed', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('agency-notifications-changed', refresh) }
  }, [pathname])

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:px-6">
      <button type="button" className="text-text-secondary md:hidden" onClick={() => router.push('/')} aria-label="Go to dashboard"><Home className="h-5 w-5" /></button>
      <form onSubmit={submitSearch} className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" aria-label="Search projects" className="w-full rounded-md border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-text-tertiary focus:border-accent" />
      </form>

      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => router.push('/notifications')} className="relative rounded-md border border-border bg-surface p-2 text-text-secondary transition hover:text-fg" aria-label={`Open notifications${unread ? `, ${unread} unread` : ''}`}><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-bold leading-4 text-accent-foreground">{unread > 99 ? '99+' : unread}</span>}</button>
        <button type="button" onClick={toggleTheme} className="rounded-md border border-border bg-surface p-2 text-text-secondary transition hover:text-fg" aria-label="Toggle color theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <div className="mx-1 hidden h-7 w-px bg-border sm:block" />
        <div className="hidden text-right sm:block"><div className="max-w-40 truncate text-xs font-semibold text-fg">{profile?.full_name || profile?.email}</div><div className="mt-0.5 font-mono-tech text-[8px] text-text-tertiary">{profile?.role || 'employee'}</div></div>
        <button type="button" onClick={handleSignOut} className="rounded-md border border-border bg-surface p-2 text-text-secondary transition hover:border-red-500/30 hover:text-red-400" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>
    </header>
  )
}
