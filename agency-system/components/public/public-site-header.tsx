'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, Globe, LogIn, Menu, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export type HeaderLink = {
  href: string
  label: string
  key?: string
  current?: boolean
}

export type HeaderCta = {
  href: string
  label: string
  hidden?: boolean
}

export interface PublicSiteHeaderProps {
  /**
   * Header visual variant.
   * - 'standard' / 'light': Dark neutral surface with subtle border (default across the site)
   * - 'dark': Deep black (#080808) surface with subtle border for portfolio pages
   * - 'transparent': Translucent surface with blur
   */
  variant?: 'standard' | 'dark' | 'transparent' | 'light'
  /**
   * Explicit active key override ('home' | 'services' | 'portfolio' | 'forms' | 'track').
   * If omitted, active state is automatically derived from the current pathname.
   */
  activeKey?: string
  /**
   * Custom navigation links. If omitted, uses the canonical public navigation:
   * Services (/#services), Portfolio (/portfolio), Available forms (/forms), Track request (/track).
   */
  links?: HeaderLink[]
  /**
   * Primary call-to-action button. Defaults to "Request a project" linking to /forms.
   * Pass null or { hidden: true } to hide.
   */
  cta?: HeaderCta | null
  /**
   * Optional language toggle support for bilingual public pages (/track, /f/[slug]).
   */
  lang?: 'en' | 'ar'
  onLangChange?: (lang: 'en' | 'ar') => void
  /**
   * Optional contextual back-link (e.g. "Back to available forms" or "Back to all work").
   */
  backLink?: {
    href: string
    label: string
  }
}

export const CANONICAL_PUBLIC_LINKS: HeaderLink[] = [
  { href: '/#services', label: 'Services', key: 'services' },
  { href: '/portfolio', label: 'Portfolio', key: 'portfolio' },
  { href: '/forms', label: 'Available forms', key: 'forms' },
  { href: '/track', label: 'Track request', key: 'track' },
]

export const DEFAULT_CTA: HeaderCta = {
  href: '/forms',
  label: 'Request a project',
}

export function PublicSiteHeader({
  variant = 'standard',
  activeKey,
  links,
  cta,
  lang,
  onLangChange,
  backLink,
}: PublicSiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname() || '/'

  // Close mobile menu on route change or escape key
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    if (menuOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const isDark = variant === 'dark'
  const navLinks = links && links.length > 0 ? links : CANONICAL_PUBLIC_LINKS
  const ctaToShow = cta === null || cta?.hidden ? null : (cta || DEFAULT_CTA)

  const resolveActive = (link: HeaderLink) => {
    if (typeof link.current === 'boolean') return link.current

    if (activeKey) {
      if (link.key && link.key === activeKey) return true
      if (link.href === activeKey) return true
    }

    // Auto-detect based on current pathname
    if (link.key === 'portfolio' || link.href === '/portfolio') {
      return pathname === '/portfolio' || pathname.startsWith('/portfolio/')
    }
    if (link.key === 'forms' || link.href === '/forms') {
      return pathname === '/forms' || pathname.startsWith('/f/')
    }
    if (link.key === 'track' || link.href === '/track') {
      return pathname === '/track' || pathname.startsWith('/track/')
    }
    if (link.key === 'services') {
      return pathname === '/services' || (pathname === '/' && activeKey === 'services')
    }
    if (link.key === 'home' || link.href === '/') {
      return pathname === '/' && !activeKey
    }

    return pathname === link.href
  }

  return (
    <header
      className={cn(
        'sticky inset-x-0 top-0 z-40 w-full transition-colors duration-200',
        isDark
          ? 'border-b border-white/10 bg-[#080808]/90 backdrop-blur-md text-white'
          : variant === 'transparent'
            ? 'border-b border-border/40 bg-bg/75 backdrop-blur-md text-fg'
            : 'border-b border-border bg-bg/90 backdrop-blur-md text-fg'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand Logo Treatment */}
        <Link
          href="/"
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
          onClick={() => setMenuOpen(false)}
          aria-label="Agency OS — Back to home"
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-accent transition-colors group-hover:border-accent',
              isDark
                ? 'border-white/20 bg-white/[0.05]'
                : 'border-line-light bg-surface-raised'
            )}
          >
            <Zap className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
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
          </span>
        </Link>

        {/* Canonical Desktop Navigation Links */}
        <nav className="hidden items-center gap-6 lg:gap-8 md:flex" aria-label="Primary navigation">
          {navLinks.map((link) => {
            const active = resolveActive(link)
            return (
              <Link
                key={link.href + link.label}
                href={link.href}
                className={cn(
                  'relative py-1 text-xs font-medium transition-colors',
                  isDark
                    ? active
                      ? 'text-white font-semibold'
                      : 'text-white/65 hover:text-white'
                    : active
                      ? 'text-fg font-semibold'
                      : 'text-text-secondary hover:text-fg'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
                {active && (
                  <span
                    className="absolute -bottom-[21px] left-0 right-0 h-0.5 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right-Side Action Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Optional Back link */}
          {backLink && (
            <Link
              href={backLink.href}
              className={cn(
                'hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors sm:inline-flex',
                isDark
                  ? 'border-white/15 bg-white/[0.04] text-white/70 hover:border-white/30 hover:text-white'
                  : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{backLink.label}</span>
            </Link>
          )}

          {/* Optional Language Switcher */}
          {lang && onLangChange && (
            <button
              type="button"
              onClick={() => onLangChange(lang === 'ar' ? 'en' : 'ar')}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                isDark
                  ? 'border-white/15 bg-white/[0.04] text-white/70 hover:border-white/30 hover:text-white'
                  : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
              )}
              aria-label={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
          )}

          {/* Login Button */}
          <Link
            href="/auth"
            className={cn(
              'hidden min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors sm:inline-flex',
              isDark
                ? 'border-white/15 bg-white/[0.04] text-white/70 hover:border-white/30 hover:text-white'
                : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
            )}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Login</span>
          </Link>

          {/* Primary CTA Button */}
          {ctaToShow && (
            <Link
              href={ctaToShow.href}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-accent bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition hover:brightness-110 shadow-sm"
            >
              <span>{ctaToShow.label}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md border transition-colors md:hidden',
              isDark
                ? 'border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                : 'border-border bg-surface text-fg hover:bg-surface-raised'
            )}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-panel"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Cohesive Mobile Navigation Drawer */}
      {menuOpen && (
        <div
          id="mobile-nav-panel"
          className={cn(
            'border-b backdrop-blur-xl shadow-2xl md:hidden transition-all duration-200',
            isDark
              ? 'border-white/10 bg-[#0d0d0d]/98'
              : 'border-border bg-surface/98'
          )}
        >
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <nav className="grid gap-1" aria-label="Mobile primary navigation">
              {navLinks.map((link) => {
                const active = resolveActive(link)
                return (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex min-h-11 items-center justify-between rounded-md px-3.5 py-2.5 text-sm font-medium transition-colors',
                      isDark
                        ? active
                          ? 'border-l-2 border-accent bg-white/[0.08] text-white font-semibold'
                          : 'border-l-2 border-transparent text-white/70 hover:bg-white/[0.04] hover:text-white'
                        : active
                          ? 'border-l-2 border-accent bg-surface-raised text-fg font-semibold'
                          : 'border-l-2 border-transparent text-text-secondary hover:bg-surface-raised hover:text-fg'
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span>{link.label}</span>
                    {active && (
                      <span className="font-mono-tech text-[10px] text-accent">CURRENT</span>
                    )}
                  </Link>
                )
              })}
            </nav>

            <div
              className={cn(
                'mt-3 grid gap-2 border-t pt-3',
                isDark ? 'border-white/10' : 'border-border'
              )}
            >
              {lang && onLangChange && (
                <button
                  type="button"
                  onClick={() => {
                    onLangChange(lang === 'ar' ? 'en' : 'ar')
                    setMenuOpen(false)
                  }}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                    isDark
                      ? 'border-white/15 bg-white/[0.04] text-white'
                      : 'border-border bg-surface-raised text-fg'
                  )}
                >
                  <Globe className="h-4 w-4" />
                  <span>{lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}</span>
                </button>
              )}

              <Link
                href="/auth"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                  isDark
                    ? 'border-white/15 bg-white/[0.04] text-white'
                    : 'border-border bg-surface text-text-secondary hover:text-fg'
                )}
              >
                <LogIn className="h-4 w-4" />
                <span>Team & Client Login</span>
              </Link>

              {ctaToShow && (
                <Link
                  href={ctaToShow.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 shadow-sm"
                >
                  <span>{ctaToShow.label}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
