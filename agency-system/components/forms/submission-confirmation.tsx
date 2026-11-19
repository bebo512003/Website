'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, Printer, RotateCcw } from 'lucide-react'
import { primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { SubmissionContact } from './submission-contact'
import { RequestSteps } from './request-steps'
import { publicTrackingPath } from '@/lib/submissions'
import { projectDeskPath } from '@/lib/site'
import { PublicPageIntro, publicContentClassName, publicPanelClassName } from '@/components/public/public-page-sections'
import type { FormSubmissionRow } from '@/lib/supabase/types'

type Lang = 'ar' | 'en'

interface SubmissionConfirmationProps {
  submission: FormSubmissionRow | {
    id: string
    reference_number?: string | null
    submitted_at?: string
    created_at?: string
  }
  formTitle: string
  lang?: Lang
  onReset?: () => void
  cooldownRemaining?: number
}

const NEXT_STEPS = [
  {
    en: { title: 'Brief recorded', text: 'Your answers are saved and ready for review.' },
    ar: { title: 'تم حفظ الطلب', text: 'تم تسجيل إجاباتك وأصبحت جاهزة للمراجعة.' },
  },
  {
    en: { title: 'Scope review', text: 'We review the requirements, timing, and deliverables to clarify the scope.' },
    ar: { title: 'مراجعة نطاق العمل', text: 'نراجع متطلبات المشروع والجدول الزمني والمخرجات لتحديد نطاق العمل.' },
  },
  {
    en: { title: 'Next steps', text: 'We’ll reach out by email or phone to discuss the next step.' },
    ar: { title: 'الخطوات التالية', text: 'سنتواصل معك عبر البريد الإلكتروني أو الهاتف لمناقشة الخطوة التالية.' },
  },
] as const

export function SubmissionConfirmation({ submission, formTitle, lang = 'en', onReset, cooldownRemaining = 0 }: SubmissionConfirmationProps) {
  const [copied, setCopied] = useState<'reference' | 'link' | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const isAr = lang === 'ar'
  const reference = submission.reference_number || 'REQ-PENDING'
  const submittedDate = submission.submitted_at || submission.created_at || new Date().toISOString()
  const formattedDate = new Date(submittedDate).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    dateStyle: 'long', timeStyle: 'short',
  })
  const trackPath = publicTrackingPath(reference, lang)

  useEffect(() => {
    title.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [])

  const copy = async (kind: 'reference' | 'link') => {
    try {
      await navigator.clipboard.writeText(kind === 'reference' ? reference : new URL(trackPath, window.location.origin).href)
      setCopied(kind)
      setTimeout(() => setCopied((previous) => previous === kind ? null : previous), 2000)
    } catch {
      // The reference remains selectable when clipboard access is unavailable.
    }
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} lang={lang}>
      <PublicPageIntro
        eyebrow={isAr ? 'تم تأكيد الإرسال' : 'Submission confirmed'}
        title={isAr ? 'تم استلام طلبك.' : 'Request received.'}
        description={isAr ? 'احتفظ بالرقم المرجعي لتتابع حالة طلبك دون إنشاء حساب.' : 'Save your reference number to follow the request. No account is needed.'}
        titleRef={title}
        compact
      />
      <div className={publicContentClassName}>
        <RequestSteps lang={lang} current={3} className="mb-6 print:hidden" />
        <div className={publicPanelClassName}>
          <div className="flex flex-wrap items-end justify-between gap-4 p-6 sm:p-8">
            <div className="min-w-0">
              <p className="type-label text-text-secondary">{isAr ? 'الرقم المرجعي' : 'Request reference'}</p>
              <p className="mt-2 wrap-anywhere font-mono text-xl font-medium text-fg sm:text-2xl" dir="ltr">{reference}</p>
              <p className="mt-2 text-sm text-text-secondary">
                {isAr ? 'اذكر الرقم المرجعي عند التواصل بخصوص الطلب.' : 'Include this reference if you get in touch about your request.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={trackPath} className={primaryButtonClassName}>
                {isAr ? 'تتبع الطلب' : 'Track request'} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </a>
              <button type="button" onClick={() => void copy('reference')} className={secondaryButtonClassName}>
                {copied === 'reference' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied === 'reference' ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ الرقم' : 'Copy reference')}
              </button>
              <button type="button" onClick={() => void copy('link')} className={secondaryButtonClassName}>
                {copied === 'link' ? (isAr ? 'تم نسخ الرابط' : 'Link copied') : (isAr ? 'نسخ رابط التتبع' : 'Copy tracking link')}
              </button>
            </div>
          </div>

          <SubmissionContact lang={lang} />

          <dl className="grid gap-4 border-t border-border p-6 sm:grid-cols-2 sm:p-8">
            <div>
              <dt className="type-label text-text-secondary">{isAr ? 'النموذج المرسل' : 'Submitted form'}</dt>
              <dd className="mt-1 font-medium text-fg">{formTitle}</dd>
            </div>
            <div>
              <dt className="type-label text-text-secondary">{isAr ? 'وقت الإرسال' : 'Submitted on'}</dt>
              <dd className="mt-1 font-medium text-fg"><time dateTime={submittedDate}>{formattedDate}</time></dd>
            </div>
          </dl>

          <section className="border-t border-border p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-fg">{isAr ? 'ماذا يحدث بعد ذلك؟' : 'What happens next?'}</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.en.title} className="border-t border-border pt-3">
                  <p className="type-label text-text-secondary">/ 0{index + 1}</p>
                  <h3 className="mt-2 text-sm font-semibold text-fg">{step[lang].title}</h3>
                  <p className="mt-1 text-sm text-text-secondary">{step[lang].text}</p>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-6 sm:p-8 print:hidden">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => window.print()} className={secondaryButtonClassName}>
                <Printer className="size-4" aria-hidden="true" /> {isAr ? 'طباعة التأكيد' : 'Print confirmation'}
              </button>
              <a href={projectDeskPath(lang)} className={secondaryButtonClassName}>{isAr ? 'جميع النماذج' : 'Available forms'}</a>
            </div>
            {onReset && (cooldownRemaining > 0 ? (
              <p className="text-xs text-text-secondary">{isAr ? `يمكنك إرسال رد آخر بعد ${cooldownRemaining} ثانية` : `You can submit another response in ${cooldownRemaining}s`}</p>
            ) : (
              <button type="button" onClick={onReset} className={secondaryButtonClassName}>
                <RotateCcw className="size-4" aria-hidden="true" /> {isAr ? 'إرسال رد جديد' : 'Submit another response'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
