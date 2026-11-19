import { Clock } from 'lucide-react'
import { ContactLinks } from '@/components/public/contact-links'
import { REQUEST_RESPONSE_TIME } from '@/lib/contact'
import { SITE_NAME, SITE_NAME_AR } from '@/lib/site'

export function SubmissionContact({ lang }: { lang: 'en' | 'ar' }) {
  const isAr = lang === 'ar'
  return (
    <section className="border-t border-border bg-bg p-6 sm:p-8" aria-label={isAr ? 'التواصل والمتابعة' : 'Contact and follow-up'}>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.5} aria-hidden="true" />
          <div>
            <p className="text-sm text-text-secondary">{isAr ? 'الوقت المتوقع للرد' : 'Expected response'}</p>
            <p className="mt-1 text-base font-semibold text-fg">{REQUEST_RESPONSE_TIME[lang]}</p>
          </div>
        </div>
        <div className="min-w-0 border-t border-border pt-5 sm:border-s sm:border-t-0 sm:ps-6 sm:pt-0">
          <p className="font-semibold text-fg">{isAr ? `تواصل مع ${SITE_NAME_AR}` : `Contact ${SITE_NAME}`}</p>
          <ContactLinks lang={lang} className="mt-2" />
        </div>
      </div>
    </section>
  )
}
