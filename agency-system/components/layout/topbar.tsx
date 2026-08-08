'use client'

import {
  Search,
  Bell,
  Moon,
  Sun,
  Globe,
  User,
  Command,
  LogOut,
  LogIn,
} from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { useLanguage } from '@/contexts/language-context'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'

export function TopBar() {
  const { theme, toggleTheme } = useTheme()
  const { language, toggleLanguage, t } = useLanguage()
  const { user, profile, signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth')
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-6 relative">
      {/* Top accent line */}
      <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-accent/60 via-accent/20 to-transparent" />

      {/* Search */}
      <div className="flex flex-1 items-center gap-4">
        <button className="flex items-center gap-3 rounded-[4px] border border-border bg-surface-raised px-4 py-2 w-full max-w-md text-sm text-text-tertiary hover:border-line-light transition-colors">
          <Search className="h-4 w-4" strokeWidth={1.5} />
          <span>{t('search.placeholder')}</span>
          <span className="mr-auto flex items-center gap-1 border border-border px-1.5 py-0.5 rounded text-[10px] font-mono-tech">
            <Command className="h-3 w-3" />
            <span>K</span>
          </span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Language Toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 rounded-[4px] border border-border px-3 py-2 text-xs text-text-secondary hover:border-line-light hover:text-fg transition-colors bg-surface"
        >
          <Globe className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="font-bold">{language.toUpperCase()}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-[4px] border border-border p-2 text-text-secondary hover:border-line-light hover:text-fg transition-colors bg-surface"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>

        {/* Notifications */}
        <button className="relative rounded-[4px] border border-border p-2 text-text-secondary hover:border-line-light hover:text-fg transition-colors bg-surface">
          <Bell className="h-4 w-4" strokeWidth={1.5} />
          <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground border border-accent-glow">
            3
          </span>
        </button>

        {/* Separator */}
        <div className="mx-2 h-8 w-[1px] bg-border" />

        {/* User Menu */}
        {user ? (
          <div className="flex items-center gap-3 pr-1">
            <div className="flex flex-col items-end">
              <span className="text-sm font-semibold">
                {profile?.full_name || user.email}
              </span>
              <span className="font-mono-tech">{profile?.role || t('user.role')}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-border bg-surface-raised text-text-secondary hover:text-red-500 hover:border-red-500/30 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => router.push('/auth')}
            className="flex items-center gap-2 rounded-[4px] border border-accent bg-accent/10 px-4 py-2 text-xs font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogIn className="h-4 w-4" />
            <span>تسجيل الدخول</span>
          </button>
        )}
      </div>
    </header>
  )
}
