'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUpRight, LoaderCircle, Search } from 'lucide-react'
import type { PublicFormTemplateSummary, PublicSubmissionTracking } from '@/lib/supabase/types'
import { SITE_CONTACT } from '@/lib/contact'
import { publicTrackingPath } from '@/lib/submissions'
import { PublicPage } from '@/components/public/public-page'
import { PublicPageIntro, PublicSectionHeading, PublicWorkArea, publicContentClassName, publicPanelClassName } from '@/components/public/public-page-sections'
import { PublishedFormCard } from '@/components/public/published-form-card'
import { InlineAlert, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { RequestSteps } from './request-steps'
import { SubmissionTrackingView } from './submission-tracking-view'

type Lang = 'en' | 'ar'
type CatalogProps = { forms: PublicFormTemplateSummary[]; catalogUnavailable: boolean }

function ProjectCatalog({ forms, catalogUnavailable, lang }: CatalogProps & { lang: Lang }) {
  const isAr = lang === 'ar'
  return (
    <section id="request" aria-labelledby="request-title" tabIndex={-1} className="scroll-mt-24">
      <PublicSectionHeading
        eyebrow={isAr ? '٠١ / مشروع جديد' : 'N° 01 / New project'}
        title={isAr ? 'ابدأ بملخص مشروعك.' : 'Start with a brief.'}
        titleId="request-title"
      />
      {forms.length > 0 ? (
        <>
          <RequestSteps current={1} lang={lang} className="mt-6" />
          <div className={`mt-6 grid gap-4 ${forms.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {forms.map((form) => <PublishedFormCard key={form.id} form={form} lang={lang} />)}
          </div>
        </>
      ) : (
        <div className={`${publicPanelClassName} mt-6 p-5 sm:p-6`}>
          <h3 className="text-lg font-semibold text-fg">{isAr ? 'أرسل ملخص مشروعك مباشرةً.' : 'Send a brief directly.'}</h3>
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            {catalogUnavailable
              ? (isAr ? 'النماذج غير متاحة مؤقتًا. احكِ لنا عن مشروعك بالبريد الإلكتروني أو واتساب.' : 'Online forms are temporarily unavailable. Tell me about your project by email or WhatsApp.')
              : (isAr ? 'لا توجد نماذج مفتوحة الآن. تقدر تحكي لنا عن مشروعك بالبريد الإلكتروني أو واتساب.' : 'No forms are open at the moment. Tell me about your project by email or WhatsApp.')}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={SITE_CONTACT.mailto} className={primaryButtonClassName}>
              {isAr ? 'أرسل بالبريد الإلكتروني' : 'Email your brief'} <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </a>
            <a href={SITE_CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" className={secondaryButtonClassName}>
              {isAr ? 'واتساب' : 'WhatsApp'} <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </section>
  )
}

function DeskFrame({ forms, catalogUnavailable, lang, tracking, result }: CatalogProps & {
  lang: Lang
  tracking?: ReactNode
  result?: ReactNode
}) {
  const isAr = lang === 'ar'
  return (
    <PublicPage activeKey="forms" lang={lang}>
      <PublicPageIntro
        eyebrow={isAr ? 'طلبات المشاريع' : 'Project requests'}
        title={isAr ? 'طلبات مشاريعك.' : <>Project <strong className="font-bold">desk.</strong></>}
        description={result
          ? (isAr ? 'هنا تقدر تراجع آخر تحديث والخطوات القادمة لطلبك.' : 'See the latest status and next steps for your request.')
          : (isAr ? 'شاركنا فكرة مشروع جديد أو تابع طلبًا سبق إرساله. من غير ما تحتاج حساب.' : 'Share a new brief or check the status of a request you already sent. No account needed.')}
        actions={result ? undefined : <>
          <a href="#request" className={primaryButtonClassName}>
            {isAr ? 'ابدأ مشروعًا' : 'Start a project'} <ArrowDown className="size-4" aria-hidden="true" />
          </a>
          <a href="#track" className={secondaryButtonClassName}>
            {isAr ? 'تتبع طلبًا' : 'Track a request'} <ArrowDown className="size-4" aria-hidden="true" />
          </a>
        </>}
        compact
      />
      {result ?? (
        <PublicWorkArea aside={(
          <section id="track" aria-labelledby="track-title" tabIndex={-1} className="scroll-mt-24 border-t border-border pt-7 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
            <PublicSectionHeading
              eyebrow={isAr ? '٠٢ / متابعة' : 'N° 02 / Follow-up'}
              title={isAr ? 'تتبع طلبك.' : 'Track your request.'}
              titleId="track-title"
            />
            {tracking}
          </section>
        )}>
          <ProjectCatalog forms={forms} catalogUnavailable={catalogUnavailable} lang={lang} />
        </PublicWorkArea>
      )}
    </PublicPage>
  )
}

function ProjectDeskContent(props: CatalogProps) {
  const searchParams = useSearchParams()
  const lang = searchParams.get('lang') === 'ar' ? 'ar' : 'en'
  const isAr = lang === 'ar'
  const queryKey = searchParams.get('ref') || searchParams.get('token') || searchParams.get('key') || ''
  const [searchInput, setSearchInput] = useState('')
  const [trackingData, setTrackingData] = useState<PublicSubmissionTracking | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<'not-found' | 'unavailable' | null>(null)
  const lastUrlLookup = useRef('')
  const pendingLookup = useRef<AbortController | null>(null)
  const searchField = useRef<HTMLInputElement>(null)
  const resultSection = useRef<HTMLElement>(null)
  const focusSearch = useRef(false)

  const clearLookup = useCallback(() => {
    pendingLookup.current?.abort()
    pendingLookup.current = null
    setTrackingData(null)
    setSearchInput('')
    setError(null)
    setLoading(false)
  }, [])

  const performLookup = useCallback(async (rawKey: string) => {
    const key = rawKey.trim()
    if (!key) return

    pendingLookup.current?.abort()
    const controller = new AbortController()
    pendingLookup.current = controller
    setLoading(true)
    setError(null)
    setTrackingData(null)

    try {
      // This existing public gateway uses the same read-only RPC for references
      // and tokens. Keep the lookup key out of the API request URL.
      const response = await fetch('/api/forms/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!response.ok) {
        setError(response.status === 404 ? 'not-found' : 'unavailable')
        return
      }

      const { data } = await response.json() as { data: PublicSubmissionTracking | null }
      if (controller.signal.aborted) return
      if (!data) {
        setError('unavailable')
        return
      }

      // Update the shareable address without re-querying the same reference.
      lastUrlLookup.current = data.reference_number
      const language = new URLSearchParams(window.location.search).get('lang') === 'ar' ? 'ar' : 'en'
      window.history.replaceState(null, '', publicTrackingPath(data.reference_number, language))
      setTrackingData(data)
    } catch {
      if (!controller.signal.aborted) setError('unavailable')
    } finally {
      if (pendingLookup.current === controller) {
        pendingLookup.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => () => {
    lastUrlLookup.current = ''
    pendingLookup.current?.abort()
    pendingLookup.current = null
  }, [])

  useEffect(() => {
    // Back/forward and old links can change the search key without a form submit.
    if (queryKey === lastUrlLookup.current) return
    lastUrlLookup.current = queryKey
    if (!queryKey) {
      clearLookup()
      return
    }
    setSearchInput(queryKey)
    void performLookup(queryKey)
  }, [queryKey, clearLookup, performLookup])

  useEffect(() => {
    if (trackingData) {
      resultSection.current?.focus()
    } else if (focusSearch.current) {
      focusSearch.current = false
      searchField.current?.focus()
    } else if (window.location.hash === '#request') {
      // The anchor may not have existed before the request result was cleared.
      document.getElementById('request')?.scrollIntoView({ block: 'start' })
    }
  }, [trackingData])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void performLookup(searchInput)
  }

  function searchAnother() {
    focusSearch.current = true
    clearLookup()
    window.history.replaceState(null, '', publicTrackingPath(undefined, lang))
  }

  return (
    <DeskFrame
      {...props}
      lang={lang}
      result={trackingData ? (
        <section id="track" ref={resultSection} tabIndex={-1} aria-label={isAr ? 'حالة الطلب' : 'Request status'} className={`${publicContentClassName} scroll-mt-18`}>
          <SubmissionTrackingView tracking={trackingData} lang={lang} onSearchAnother={searchAnother} />
        </section>
      ) : undefined}
      tracking={(
        <form onSubmit={submit} aria-busy={loading} className={`${publicPanelClassName} mt-6 p-5`}>
          <label htmlFor="ref-search" className="block text-sm font-medium text-fg">
            {isAr ? 'الرقم المرجعي أو رمز التتبع' : 'Reference number or tracking token'}
          </label>
          <input
            id="ref-search"
            ref={searchField}
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="REQ-2611-XXXXXX"
            className={`${inputClassName} mt-3 font-mono`}
            aria-describedby="ref-search-hint"
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            required
          />
          <p id="ref-search-hint" className="mt-2 text-xs leading-5 text-text-secondary">
            {isAr ? 'تلاقي الرقم في شاشة تأكيد الإرسال أو رسالة البريد.' : 'Find it on your confirmation screen or in the receipt email.'}
          </p>
          <button type="submit" disabled={loading || !searchInput.trim()} className={`${primaryButtonClassName} mt-4 w-full`}>
            {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
            {loading ? (isAr ? 'جارٍ البحث…' : 'Searching…') : (isAr ? 'تتبع الطلب' : 'Track request')}
          </button>
          {error && (
            <div className="mt-4">
              <InlineAlert>{error === 'not-found'
                ? (isAr ? 'لم نجد طلبًا مطابقًا. راجع الرقم وحاول مرة تانية.' : 'No request found. Check the reference and try again.')
                : (isAr ? 'التتبع غير متاح مؤقتًا. حاول تاني أو راسلنا للمساعدة.' : 'Tracking is temporarily unavailable. Try again or email me for help.')}
              </InlineAlert>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-text-secondary">
            <span>{isAr ? 'فقدت الرقم المرجعي؟' : 'Lost your reference?'}</span>
            <a href={SITE_CONTACT.mailto} className="inline-flex min-h-8 items-center gap-1.5 text-fg underline underline-offset-4">
              {isAr ? 'راسلنا للمساعدة' : 'Email for help'} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </div>
        </form>
      )}
    />
  )
}

export function ProjectDesk(props: CatalogProps) {
  return (
    // Render the cached catalog before hydration; only lookup needs the URL.
    <Suspense fallback={<DeskFrame {...props} lang="en" tracking={(
      <div className={`${publicPanelClassName} mt-6 p-5`} role="status">
        <p className="text-sm text-text-secondary">Loading request tracking…</p>
      </div>
    )} />}>
      <ProjectDeskContent {...props} />
    </Suspense>
  )
}
