'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Copy,
  Check,
  Clock,
  Mail,
  Phone,
  Printer,
  ExternalLink,
  Sparkles,
  Layers3,
  Home,
  FileText,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { AGENCY_CONTACT } from '@/lib/submissions'
import type { FormSubmissionRow } from '@/lib/supabase/types'

type Lang = 'ar' | 'en'

interface SubmissionConfirmationProps {
  submission: FormSubmissionRow | {
    id: string
    reference_number?: string | null
    tracking_token?: string | null
    form_id?: string
    submitted_at?: string
    created_at?: string
    respondent_name?: string | null
    company_name?: string | null
  }
  formTitle: string
  formDescription?: string | null
  lang?: Lang
  onReset?: () => void
  cooldownRemaining?: number
}

export function SubmissionConfirmation({
  submission,
  formTitle,
  lang = 'en',
  onReset,
  cooldownRemaining = 0,
}: SubmissionConfirmationProps) {
  const [copiedRef, setCopiedRef] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const isAr = lang === 'ar'
  const reference = submission.reference_number || 'REQ-PENDING'
  const submittedDate = submission.submitted_at || submission.created_at || new Date().toISOString()
  const formattedDate = new Date(submittedDate).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const trackPath = `/track?ref=${encodeURIComponent(reference)}`

  const handleCopyRef = async () => {
    try {
      await navigator.clipboard.writeText(reference)
      setCopiedRef(true)
      setTimeout(() => setCopiedRef(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleCopyLink = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const url = `${origin}/track?ref=${encodeURIComponent(reference)}`
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12" dir={isAr ? 'rtl' : 'ltr'}>
      {/* ── Success Banner ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-2xl">
        <div className="border-b border-border bg-gradient-to-r from-emerald-500/10 via-accent/10 to-transparent p-6 sm:p-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-start sm:gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="mt-4 min-w-0 sm:mt-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                {isAr ? 'تم استلام طلبك بنجاح' : 'Submission Confirmed'}
              </span>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {isAr ? 'شكراً لك، تم تسجيل طلبك!' : 'Thank you! Your request has been received.'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {isAr
                  ? 'تم حفظ إجاباتك وبيانات طلبك بنجاح في نظامنا. لا تحتاج إلى إنشاء حساب لمتابعة الطلب — احتفظ برقم المرجع أدناه للمتابعة في أي وقت.'
                  : 'Your submission and answers have been safely cataloged in our pipeline. You do NOT need an account to track this request — save your reference number below.'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Reference Number & Direct Tracking ──────────────────────────── */}
        <div className="border-b border-border bg-surface-raised p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono-tech text-[10px] tracking-widest text-text-tertiary">
                {isAr ? 'رقم المرجع الخاص بطلبك' : 'REQUEST REFERENCE NUMBER'}
              </p>
              <div className="mt-1 flex items-center gap-3">
                <span className="font-mono-tech text-2xl font-bold tracking-wider text-accent sm:text-3xl">
                  {reference}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyRef()}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
                  title={isAr ? 'نسخ رقم المرجع' : 'Copy reference number'}
                >
                  {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedRef ? (isAr ? 'تم النسخ' : 'Copied!') : (isAr ? 'نسخ' : 'Copy')}</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-text-tertiary">
                {isAr
                  ? 'استخدم هذا الرمز لمتابعة تقدم الطلب أو عند التواصل مع فريق الدعم.'
                  : 'Quote this unique reference code whenever contacting support or checking status.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={trackPath}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition hover:brightness-110"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isAr ? 'تتبع حالة الطلب الآن' : 'Track Status Live'}
              </Link>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLink ? (isAr ? 'تم نسخ الرابط' : 'Link Copied!') : (isAr ? 'نسخ رابط التتبع' : 'Copy Link')}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
              >
                <Printer className="h-3.5 w-3.5" />
                {isAr ? 'طباعة' : 'Print'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Summary Details ────────────────────────────────────────────── */}
        <div className="grid gap-4 border-b border-border p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-md border border-border bg-bg/50 p-4">
            <span className="font-mono-tech text-[10px] tracking-wider text-text-tertiary">
              {isAr ? 'الخدمة / النموذج' : 'SUBMITTED FORM / SERVICE'}
            </span>
            <p className="mt-1 text-sm font-semibold text-fg">{formTitle}</p>
          </div>
          <div className="rounded-md border border-border bg-bg/50 p-4">
            <span className="font-mono-tech text-[10px] tracking-wider text-text-tertiary">
              {isAr ? 'تاريخ ووقت الإرسال' : 'SUBMISSION DATE & TIME'}
            </span>
            <p className="mt-1 text-sm font-semibold text-fg">{formattedDate}</p>
          </div>
        </div>

        {/* ── What Happens Next ──────────────────────────────────────────── */}
        <div className="border-b border-border p-6 sm:p-8">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-fg">
              {isAr ? 'ماذا يحدث بعد ذلك؟' : 'What Happens Next'}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col rounded-md border border-border bg-bg/40 p-4">
              <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 font-mono-tech text-xs font-bold text-accent">
                01
              </span>
              <h3 className="text-xs font-semibold text-fg">
                {isAr ? 'توثيق وتوجيه الطلب' : 'Request Logged & Queued'}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                {isAr
                  ? 'تم حفظ متطلباتك وتوجيهها مباشرة إلى الفريق المتخصص بالمجال.'
                  : 'Your project brief has been recorded and assigned to our domain specialists.'}
              </p>
            </div>

            <div className="flex flex-col rounded-md border border-border bg-bg/40 p-4">
              <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 font-mono-tech text-xs font-bold text-accent">
                02
              </span>
              <h3 className="text-xs font-semibold text-fg">
                {isAr ? 'المراجعة الفنية وتقييم النطاق' : 'Scope & Feasibility Review'}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                {isAr
                  ? 'نقوم بدراسة المتطلبات الفنية، الجدول الزمني، والموارد المناسبة.'
                  : 'Our leads evaluate project requirements, timelines, deliverables, and capacity.'}
              </p>
            </div>

            <div className="flex flex-col rounded-md border border-border bg-bg/40 p-4">
              <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 font-mono-tech text-xs font-bold text-accent">
                03
              </span>
              <h3 className="text-xs font-semibold text-fg">
                {isAr ? 'التواصل المباشر والخطوات التالية' : 'Outreach & Proposal'}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                {isAr
                  ? 'سيتواصل معك مدير المشروع بالبريد أو الهاتف لمناقشة خطة العمل.'
                  : 'A project lead will reach out via email or phone with next steps or a tailored proposal.'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Expected Response Time & Contact Information ────────────────── */}
        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-md border border-accent/20 bg-accent/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {isAr ? 'الوقت المتوقع للرد' : 'Expected Response Time'}
                </h3>
                <p className="mt-1 text-sm font-bold text-fg">
                  {isAr ? AGENCY_CONTACT.expectedResponseAr : AGENCY_CONTACT.expectedResponse}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {isAr ? AGENCY_CONTACT.hoursAr : AGENCY_CONTACT.hours}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface-raised p-4 sm:p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {isAr ? 'معلومات التواصل المباشر' : 'Direct Contact & Inquiries'}
            </h3>
            <div className="mt-2 space-y-1.5 text-xs text-text-secondary">
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-accent" />
                <a href={`mailto:${AGENCY_CONTACT.email}`} className="font-medium text-fg hover:underline">
                  {AGENCY_CONTACT.email}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-accent" />
                <a href={`tel:${AGENCY_CONTACT.phone}`} className="font-medium text-fg hover:underline">
                  {AGENCY_CONTACT.phone}
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer Actions ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 py-2 text-xs font-medium text-fg transition hover:border-line-light"
            >
              <Home className="h-3.5 w-3.5" />
              {isAr ? 'الرئيسية' : 'Home'}
            </Link>
            <Link
              href="/forms"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 py-2 text-xs font-medium text-fg transition hover:border-line-light"
            >
              <FileText className="h-3.5 w-3.5" />
              {isAr ? 'جميع النماذج' : 'Available Forms'}
            </Link>
            <Link
              href="/portfolio"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 py-2 text-xs font-medium text-fg transition hover:border-line-light"
            >
              <Layers3 className="h-3.5 w-3.5" />
              {isAr ? 'سابقة الأعمال' : 'Portfolio'}
            </Link>
          </div>

          {onReset && (
            <div>
              {cooldownRemaining > 0 ? (
                <span className="text-xs text-text-tertiary">
                  {isAr
                    ? `يمكنك إرسال رد آخر بعد ${cooldownRemaining} ثانية`
                    : `You can submit another response in ${cooldownRemaining}s`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {isAr ? 'إرسال رد جديد' : 'Submit Another Response'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
