import Link from 'next/link'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PublicSiteFooter({ variant = 'standard' }: { variant?: 'standard' | 'dark' | 'light' }) {
  const isDark = variant === 'dark'

  return (
    <footer
      className={cn(
        'w-full border-t transition-colors duration-200',
        isDark
          ? 'border-white/10 bg-[#080808] text-white'
          : 'border-border bg-bg text-fg'
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        {/* Brand Logo in Footer */}
        <Link
          href="/"
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
          aria-label="Agency OS — Back to home"
        >
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border text-accent transition-colors group-hover:border-accent',
              isDark
                ? 'border-white/20 bg-white/[0.05]'
                : 'border-line-light bg-surface-raised'
            )}
          >
            <Zap className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <span
              className={cn(
                'text-sm font-bold tracking-[0.22em] leading-tight transition-colors',
                isDark ? 'text-white' : 'text-fg'
              )}
            >
              AGENCY OS
            </span>
            <span
              className={cn(
                'font-mono-tech text-[8px] tracking-[0.2em] leading-tight transition-colors',
                isDark ? 'text-white/40' : 'text-text-tertiary'
              )}
            >
              CREATIVE STUDIO
            </span>
          </div>
        </Link>

        {/* Canonical Footer Navigation Links */}
        <nav
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs"
          aria-label="Footer navigation"
        >
          <Link
            href="/#services"
            className={cn(
              'transition-colors',
              isDark ? 'text-white/60 hover:text-white' : 'text-text-secondary hover:text-fg'
            )}
          >
            Services
          </Link>
          <Link
            href="/portfolio"
            className={cn(
              'transition-colors',
              isDark ? 'text-white/60 hover:text-white' : 'text-text-secondary hover:text-fg'
            )}
          >
            Portfolio
          </Link>
          <Link
            href="/forms"
            className={cn(
              'transition-colors',
              isDark ? 'text-white/60 hover:text-white' : 'text-text-secondary hover:text-fg'
            )}
          >
            Available forms
          </Link>
          <Link
            href="/track"
            className={cn(
              'transition-colors',
              isDark ? 'text-white/60 hover:text-white' : 'text-text-secondary hover:text-fg'
            )}
          >
            Track request
          </Link>
          <Link
            href="/auth"
            className={cn(
              'transition-colors',
              isDark ? 'text-white/60 hover:text-white' : 'text-text-secondary hover:text-fg'
            )}
          >
            Login
          </Link>
        </nav>

        <p
          className={cn(
            'font-mono-tech text-[9px] tracking-wider',
            isDark ? 'text-white/40' : 'text-text-tertiary'
          )}
        >
          © {new Date().getFullYear()} AGENCY OS. ALL RIGHTS RESERVED.
        </p>
      </div>
    </footer>
  )
}
