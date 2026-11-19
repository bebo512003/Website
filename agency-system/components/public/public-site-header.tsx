'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Globe, LogIn, Menu, X } from 'lucide-react'
import { SITE_NAME, SITE_NAME_AR, SITE_NAVIGATION } from '@/lib/site'
import { cn } from '@/lib/utils'
import { BrandLockup } from './brand'
import { PublicLink } from './public-link'
import { primaryButtonClassName } from '@/components/ui/page'

const HEADER_NAVIGATION = [
  { key: 'home', href: '/', en: 'Home', ar: 'الرئيسية' },
  ...SITE_NAVIGATION,
] as const

type NavigationItem = (typeof HEADER_NAVIGATION)[number]
type NavigationKey = NavigationItem['key']

type PublicSiteHeaderProps = {
  activeKey?: string
  lang?: 'en' | 'ar'
  onLangChange?: (lang: 'en' | 'ar') => void
  backLink?: { href: string; label: string }
}

export function PublicSiteHeader({ activeKey, lang = 'en', onLangChange, backLink }: PublicSiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [visibleSection, setVisibleSection] = useState<{ pathname: string; key: NavigationKey } | null>(null)
  const header = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const pathname = usePathname() || '/'
  const isAr = lang === 'ar'
  const isAuthPage = pathname === '/auth'
  const loginLabel = isAr ? 'تسجيل الدخول' : 'Sign in'
  const requestLabel = isAr ? 'اطلب مشروعًا' : 'Request a project'
  const switchLabel = isAr ? 'Switch to English' : 'التحويل إلى العربية'

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  useEffect(() => {
    const sections = SITE_NAVIGATION.flatMap(({ key, sectionId }) => {
      if (pathname !== '/' && key !== 'contact') return []
      const section = document.getElementById(sectionId)
      return section ? [{ key, section }] : []
    })
    const contact = sections.find(({ key }) => key === 'contact')?.section
    let frame: number | null = null
    const scheduleUpdate = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        const headerBottom = header.current?.getBoundingClientRect().bottom ?? 0
        const readingLine = headerBottom + 32
        const { clientHeight, scrollHeight } = document.documentElement
        const atEnd = window.scrollY + clientHeight >= scrollHeight - 2
        const footerContact = atEnd ? contact?.getBoundingClientRect() : undefined
        // The footer often can't reach the reading line before scrolling ends.
        const atContact = footerContact && footerContact.top < clientHeight && footerContact.bottom > headerBottom
          && (window.scrollY > 0 || window.location.hash === '#contact')
        const key = atContact ? 'contact' : sections.find(({ section }) => {
          const { top, bottom } = section.getBoundingClientRect()
          return top <= readingLine && bottom > readingLine
        })?.key
        setVisibleSection((previous) => {
          if (!key) return null
          return previous?.pathname === pathname && previous.key === key ? previous : { pathname, key }
        })
      })
    }

    scheduleUpdate()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('hashchange', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('pageshow', scheduleUpdate)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('hashchange', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('pageshow', scheduleUpdate)
    }
  }, [pathname])

  const sectionKey = visibleSection?.pathname === pathname ? visibleSection.key : undefined
  const pageKey = pathname === '/'
    ? 'home'
    : activeKey ?? HEADER_NAVIGATION.find(({ key, href }) =>
      pathname === href || pathname.startsWith(`${href}/`) || (key === 'forms' && pathname.startsWith('/f/')),
    )?.key
  const currentKey = sectionKey ?? pageKey
  const currentLocation = (key: NavigationKey) =>
    key === currentKey ? (sectionKey ? 'location' : 'page') : undefined

  return (
    <header ref={header} className="sticky inset-x-0 top-0 z-40 border-b border-border bg-bg" dir={isAr ? 'rtl' : 'ltr'} lang={lang}>
      <div className="site-container flex min-h-18 items-center justify-between gap-3 py-3 lg:gap-5">
        <Link
          href="/"
          className="shrink-0 transition-opacity hover:opacity-85"
          onClick={() => setMenuOpen(false)}
          aria-label={isAr ? `${SITE_NAME_AR} — الرئيسية` : `${SITE_NAME} — Home`}
        >
          <BrandLockup lang={lang} />
        </Link>

        <nav className="hidden items-center gap-4 text-sm lg:flex xl:gap-7" aria-label={isAr ? 'التنقل الرئيسي' : 'Primary navigation'}>
          {HEADER_NAVIGATION.map((link) => {
            const current = currentLocation(link.key)
            // A native Home link resets scroll when coming from a homepage section.
            const NavLink = link.key === 'home' ? 'a' : PublicLink
            return (
              <NavLink
                key={link.key}
                href={link.href}
                aria-current={current}
                className={cn('relative whitespace-nowrap py-2.5 hover:text-fg', current ? 'font-semibold text-fg' : 'text-text-secondary')}
              >
                {link[lang]}
                {current && <span className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-4 bg-accent" aria-hidden="true" />}
              </NavLink>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {onLangChange && (
            <button
              type="button"
              onClick={() => onLangChange(isAr ? 'en' : 'ar')}
              aria-label={switchLabel}
              className="inline-flex size-10 items-center justify-center gap-2 border border-border text-fg hover:border-line-light sm:w-auto sm:px-3"
            >
              <Globe className="size-4" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden text-xs sm:inline" lang={isAr ? 'en' : 'ar'}>{isAr ? 'English' : 'العربية'}</span>
            </button>
          )}
          <Link
            href="/auth"
            aria-label={loginLabel}
            aria-current={isAuthPage ? 'page' : undefined}
            className={cn('hidden size-10 items-center justify-center border border-border text-text-secondary hover:border-line-light hover:text-fg lg:inline-flex', isAuthPage && 'border-accent text-fg')}
          >
            <LogIn className="size-4 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <Link href="/forms" className={cn(primaryButtonClassName, 'hidden whitespace-nowrap sm:inline-flex lg:px-3')}>
            {requestLabel} <ArrowUpRight className="hidden size-4 xl:block rtl:-scale-x-100" aria-hidden="true" />
          </Link>
          <button
            type="button"
            ref={menuButton}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? (isAr ? 'إغلاق القائمة' : 'Close navigation menu') : (isAr ? 'فتح القائمة' : 'Open navigation menu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-panel"
            className="flex size-10 items-center justify-center border border-border text-fg hover:border-line-light lg:hidden"
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div id="mobile-nav-panel" hidden={!menuOpen} className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-y border-border bg-surface lg:hidden">
        <div className="site-container grid gap-4 py-5">
          <nav className="grid divide-y divide-border" aria-label={isAr ? 'التنقل على الجوال' : 'Mobile navigation'}>
            {HEADER_NAVIGATION.map((link) => {
              const current = currentLocation(link.key)
              const NavLink = link.key === 'home' ? 'a' : PublicLink
              return (
                <NavLink
                  key={link.key}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={current}
                  className={cn('flex min-h-11 items-center justify-between gap-3 text-sm text-fg hover:text-accent', current && 'font-semibold text-accent')}
                >
                  <span className="relative">
                    {link[lang]}
                    {current && <span className="absolute start-0 -bottom-1 h-0.5 w-4 bg-accent" aria-hidden="true" />}
                  </span>
                  <ArrowUpRight className="size-4 text-text-secondary rtl:-scale-x-100" aria-hidden="true" />
                </NavLink>
              )
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
            <Link href="/forms" onClick={() => setMenuOpen(false)} className={primaryButtonClassName}>{requestLabel}</Link>
            <Link href="/auth" aria-current={isAuthPage ? 'page' : undefined} onClick={() => setMenuOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg hover:underline">
              <LogIn className="size-4 rtl:rotate-180" aria-hidden="true" /> {loginLabel}
            </Link>
            {backLink && <PublicLink href={backLink.href} onClick={() => setMenuOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg hover:underline">
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" /> {backLink.label}
            </PublicLink>}
          </div>
        </div>
      </div>
    </header>
  )
}
