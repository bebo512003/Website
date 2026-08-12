'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Globe,
  LoaderCircle,
  LogIn,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
  HelpCircle,
} from 'lucide-react'
import { getPublicSubmissionTracking } from '@/lib/supabase/database'
import type { PublicSubmissionTracking } from '@/lib/supabase/types'
import { SubmissionTrackingView } from '@/components/forms/submission-tracking-view'
import { primaryButtonClassName, InlineAlert } from '@/components/ui/page'

type Lang = 'ar' | 'en'
const HEADING = 'AGENCY OS / REQUEST TRACKING'

function TrackContent() {
  const searchParams = useSearchParams()

  const [lang, setLang] = useState<Lang>('en')
  const [searchInput, setSearchInput] = useState('')
  const [activeKey, setActiveKey] = useState('')
  const [trackingData, setTrackingData] = useState<PublicSubmissionTracking | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const isAr = lang === 'ar'

  const performLookup = useCallback(async (keyToLookup: string) => {
    const clean = (keyToLookup || '').trim()
    if (!clean) {
      setError(isAr ? 'يرجى إدخال رقم المرجع أو رمز التتبع.' : 'Please enter a valid reference number or tracking token.')
      return
    }

    setLoading(true)
    setError('')
    setTrackingData(null)

    const result = await getPublicSubmissionTracking(clean)
    setLoading(false)

    if (result.error || !result.data) {
      setError(
        isAr
          ? 'لم يتم العثور على أي طلب مطابق لهذا الرمز. يرجى التأكد من كتابة الرمز بشكل صحيح والمحاولة مجدداً.'
          : result.error || 'No submission found matching this reference code. Please verify the code and try again.'
      )
    } else {
      setTrackingData(result.data)
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href)
        currentUrl.searchParams.set('ref', result.data.reference_number)
        window.history.replaceState({}, '', currentUrl.toString())
      }
    }
  }, [isAr])

  // Pre-fill and auto-track from URL query params
  useEffect(() => {
    const queryKey = searchParams.get('ref') || searchParams.get('token') || searchParams.get('key') || ''
    if (queryKey && queryKey !== activeKey) {
      setSearchInput(queryKey)
      setActiveKey(queryKey)
      void performLookup(queryKey)
    }
  }, [searchParams, activeKey, performLookup])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveKey(searchInput.trim())
    void performLookup(searchInput)
  }

  const handleResetSearch = () => {
    setTrackingData(null)
    setError('')
    setSearchInput('')
    setActiveKey('')
    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.delete('ref')
      currentUrl.searchParams.delete('token')
      currentUrl.searchParams.delete('key')
      window.history.replaceState({}, '', currentUrl.pathname)
    }
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      {/* ── Header / Nav ──────────────────────────────────────────────── */}
      <header className="sticky inset-x-0 top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="group flex items-center gap-3" onClick={() => setMenuOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center border border-line-light bg-surface-raised text-accent transition group-hover:border-accent">
              <Zap className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">
              <span className="block text-sm font-bold tracking-[0.22em] text-fg">AGENCY OS</span>
              <span className="font-mono-tech text-[8px] text-text-tertiary">CREATIVE STUDIO</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            <Link href="/portfolio" className="text-xs text-text-secondary transition hover:text-fg">Portfolio</Link>
            <Link href="/forms" className="text-xs text-text-secondary transition hover:text-fg">Available forms</Link>
            <Link href="/track" className="text-xs text-fg font-medium transition">Track request</Link>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:border-line-light hover:text-fg"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg">
              <LogIn className="h-3.5 w-3.5" /> Login
            </Link>
          </div>

          <button
            type="button"
            className="rounded-md border border-border p-2 text-fg md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-border bg-surface px-5 py-4 md:hidden" aria-label="Mobile primary">
            <div className="grid gap-1">
              <Link href="/portfolio" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">Portfolio</Link>
              <Link href="/forms" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">Available forms</Link>
              <Link href="/track" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-fg hover:bg-surface-raised">Track request</Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                className="flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs text-text-secondary"
              >
                <Globe className="h-3.5 w-3.5" />
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
              <Link href="/auth" onClick={() => setMenuOpen(false)} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-text-secondary">
                <LogIn className="h-3.5 w-3.5" /> Login
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* ── Page Body ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16" dir={isAr ? 'rtl' : 'ltr'}>
        {/* Navigation Breadcrumb / Tag */}
        <div className="mb-6 flex items-center justify-between">
          <Link href="/forms" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> {isAr ? 'العودة للنماذج المتاحة' : 'Back to available forms'}
          </Link>
          <span className="font-mono-tech text-[10px] tracking-widest text-accent">
            {HEADING}
          </span>
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
            {isAr ? 'متابعة حالة طلبك' : 'Track Your Request'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {isAr
              ? 'تابع مراحل تقدم طلبك في أي وقت وبشكل فوري دون الحاجة لتسجيل حساب. أدخل رقم المرجع الخاص بك أدناه.'
              : 'Monitor the live status of your project submission in real time. No account registration required — simply enter your request reference number.'}
          </p>
        </div>

        {/* ── Search Input Card ───────────────────────────────────────── */}
        <form onSubmit={handleSearchSubmit} className="mb-8 rounded-md border border-border bg-surface p-4 shadow-lg sm:p-6">
          <label htmlFor="ref-search" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            {isAr ? 'رقم مرجع الطلب أو رمز التتبع' : 'Request Reference Code or Tracking Token'}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                id="ref-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={isAr ? 'مثال: REQ-2608-ABC123' : 'e.g. REQ-2608-ABC123'}
                className="w-full rounded-md border border-border bg-bg px-4 py-3 font-mono-tech text-sm text-fg placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              className={`${primaryButtonClassName} min-h-11 justify-center sm:w-auto`}
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? (isAr ? 'جارٍ البحث…' : 'Searching…') : (isAr ? 'تتبع الطلب' : 'Track Request')}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-tertiary">
            {isAr
              ? '💡 تجد رقم المرجع في صفحة تأكيد الإرسال بعد إرسال النموذج.'
              : '💡 You can find your reference code on the confirmation screen presented after submitting a form.'}
          </p>
        </form>

        {/* ── Error Display ───────────────────────────────────────────── */}
        {error && (
          <div className="mb-8">
            <InlineAlert>{error}</InlineAlert>
          </div>
        )}

        {/* ── Tracking Result ─────────────────────────────────────────── */}
        {trackingData ? (
          <SubmissionTrackingView
            tracking={trackingData}
            lang={lang}
            onSearchAnother={handleResetSearch}
          />
        ) : !loading && !error ? (
          /* ── Initial Helper Guides ─────────────────────────────────── */
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-surface p-5">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-raised text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-semibold text-fg">
                {isAr ? 'بدون حساب' : 'No Account Needed'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {isAr
                  ? 'يمكنك متابعة حالة طلبك بأمان تام من خلال رمز المرجع دون الحاجة لكلمة مرور أو تسجيل دخول.'
                  : 'Track your submission securely using only your unique reference number without creating passwords.'}
              </p>
            </div>

            <div className="rounded-md border border-border bg-surface p-5">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-raised text-accent">
                <Sparkles className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-semibold text-fg">
                {isAr ? 'تحديثات مباشرة' : 'Real-Time Pipeline'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {isAr
                  ? 'يعكس المتتبع كل تحديث يقوم به الفريق من استلام الطلب حتى اعتماده وبدء التنفيذ.'
                  : 'Get transparent visibility as our specialists review, qualify, and transition your request to production.'}
              </p>
            </div>

            <div className="rounded-md border border-border bg-surface p-5">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-raised text-accent">
                <HelpCircle className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-semibold text-fg">
                {isAr ? 'دعم مستمر' : 'Direct Assistance'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {isAr
                  ? 'إذا فقدت رقم المرجع الخاص بك، تواصل مع فريق خدمة العملاء عبر البريد الإلكتروني وسنساعدك فوراً.'
                  : 'Lost your reference code? Contact our support team with your email address and we will locate it.'}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bg">
          <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
        </main>
      }
    >
      <TrackContent />
    </Suspense>
  )
}
