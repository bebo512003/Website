'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Layers3, LogIn, Menu, X, Zap } from 'lucide-react'

type HeaderLink = { href: string; label: string; current?: boolean }

export function PublicSiteHeader({
  variant = 'light',
  links,
  cta,
}: {
  variant?: 'light' | 'dark'
  links: HeaderLink[]
  cta?: { href: string; label: string }
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const dark = variant === 'dark'

  return (
    <header className={dark
      ? 'absolute inset-x-0 top-0 z-30'
      : 'sticky inset-x-0 top-0 z-40 border-b border-border bg-bg/85 backdrop-blur'}
    >
      <div className={`mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-10 ${dark ? 'py-6' : ''}`}>
        <Link href="/" className="group flex items-center gap-3" onClick={() => setMenuOpen(false)} aria-label="Agency OS home">
          <span className={dark
            ? 'flex h-9 w-9 items-center justify-center border border-white/20 bg-white/[0.05] text-accent transition group-hover:border-accent'
            : 'flex h-9 w-9 items-center justify-center border border-line-light bg-surface-raised text-accent transition group-hover:border-accent'}
          >
            {dark ? <Layers3 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
          <span className={dark ? '' : 'hidden sm:inline'}>
            <span className={`block text-sm font-bold tracking-[0.22em] ${dark ? 'text-white' : 'text-fg'}`}>AGENCY OS</span>
            <span className={`font-mono-tech text-[8px] ${dark ? 'text-white/40' : 'text-text-tertiary'}`}>CREATIVE STUDIO</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className={`text-xs transition ${
                dark
                  ? link.current ? 'text-white' : 'text-white/60 hover:text-white'
                  : link.current ? 'text-fg' : 'text-text-secondary hover:text-fg'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {!dark && (
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg">
              <LogIn className="h-3.5 w-3.5" /> Login
            </Link>
          )}
          {cta && (
            <Link
              href={cta.href}
              className={dark
                ? 'inline-flex min-h-11 items-center gap-2 border border-accent bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition hover:brightness-110'
                : 'inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition hover:brightness-110'}
            >
              {cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <button
          type="button"
          className={dark ? 'rounded border border-white/15 p-2 text-white md:hidden' : 'rounded-md border border-border p-2 text-fg md:hidden'}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {menuOpen && (
        <nav
          className={dark
            ? 'mx-5 grid gap-1 border border-white/10 bg-[#111]/95 p-4 backdrop-blur md:hidden'
            : 'border-t border-border bg-surface px-5 py-4 md:hidden'}
          aria-label="Mobile primary"
        >
          <div className="grid gap-1">
            {links.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={dark ? 'min-h-11 px-2 py-3 text-sm text-white/70' : `rounded px-3 py-2.5 text-sm ${link.current ? 'text-fg' : 'text-text-secondary'} hover:bg-surface-raised hover:text-fg`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className={dark ? '' : 'mt-3 grid gap-2 border-t border-border pt-3'}>
            {!dark && (
              <Link href="/auth" onClick={() => setMenuOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary">
                <LogIn className="h-4 w-4" /> Login
              </Link>
            )}
            {cta && (
              <Link
                href={cta.href}
                onClick={() => setMenuOpen(false)}
                className={dark
                  ? 'mt-2 inline-flex min-h-11 items-center justify-center gap-2 bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground'
                  : 'inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground'}
              >
                {cta.label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
