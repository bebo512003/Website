'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Clock,
  Copy,
  Check,
  Mail,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  FileText,
  Layers3,
  Home,
  CheckCheck,
} from 'lucide-react'
import type { PublicSubmissionTracking } from '@/lib/supabase/types'
import {
  AGENCY_CONTACT,
  CLIENT_STAGE_STEPS,
  CLIENT_STATUS_DESCRIPTIONS,
  getClientStageProgress,
  submissionStatusStyle,
} from '@/lib/submissions'

type Lang = 'ar' | 'en'

interface SubmissionTrackingViewProps {
  tracking: PublicSubmissionTracking
  lang?: Lang
  onSearchAnother?: () => void
}

export function SubmissionTrackingView({
  tracking,
  lang = 'en',
  onSearchAnother,
}: SubmissionTrackingViewProps) {
  const [copiedRef, setCopiedRef] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const isAr = lang === 'ar'
  const progressInfo = getClientStageProgress(tracking.status)

  const submittedDate = new Date(tracking.submitted_at).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const updatedDate = new Date(tracking.updated_at).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusDesc = CLIENT_STATUS_DESCRIPTIONS[tracking.status]?.[lang] || tracking.client_status_description

  const handleCopyRef = async () => {
    try {
      await navigator.clipboard.writeText(tracking.reference_number)
      setCopiedRef(true)
      setTimeout(() => setCopiedRef(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleCopyLink = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const url = `${origin}/track?ref=${encodeURIComponent(tracking.reference_number)}`
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
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-surface shadow-xl">
        <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2.5 py-0.5 font-mono-tech text-[10px] text-text-tertiary">
                <ShieldCheck className="h-3 w-3 text-accent" />
                {isAr ? 'تتبع آمن للقراءة فقط' : 'Secure Read-Only Tracking'}
              </span>
              <span className={`inline-flex items-center rounded border px-2.5 py-0.5 text-[11px] font-semibold ${submissionStatusStyle(tracking.status)}`}>
                {tracking.client_status_label}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="font-mono-tech text-2xl font-bold tracking-wider text-accent sm:text-3xl">
                {tracking.reference_number}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyRef()}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
                title={isAr ? 'نسخ رقم المرجع' : 'Copy reference number'}
              >
                {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedRef ? (isAr ? 'تم النسخ' : 'Copied!') : (isAr ? 'نسخ' : 'Copy')}</span>
              </button>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              {isAr ? 'الخدمة المطلوبة:' : 'Requested Service:'}{' '}
              <strong className="text-fg">{tracking.form_title}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedLink ? (isAr ? 'تم نسخ الرابط' : 'Link Copied!') : (isAr ? 'نسخ الرابط' : 'Share Link')}
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

        {/* ── Status Description Alert ────────────────────────────────────── */}
        <div className="border-b border-border bg-surface-raised p-6 sm:p-8">
          <div className="flex items-start gap-3">
            {tracking.status === 'need_information' ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-purple-400" />
            ) : tracking.status === 'converted' ? (
              <CheckCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            ) : tracking.status === 'rejected' ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            ) : (
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-fg">
                {isAr ? 'الحالة الحالية للطلب' : 'Current Status'}: {tracking.client_status_label}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{statusDesc}</p>
              {tracking.status === 'need_information' && (
                <p className="mt-2 text-xs font-medium text-purple-400">
                  {isAr
                    ? '💡 يرجى مراجعة بريدك الإلكتروني للرد على استفسارات الفريق، أو التواصل معنا عبر معلومات الاتصال أدناه.'
                    : '💡 Please check your email inbox to reply to our team’s questions, or contact us using the info below.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Multi-Stage Pipeline Stepper ───────────────────────────────── */}
        {!progressInfo.isDeclined && (
          <div className="border-b border-border p-6 sm:p-8">
            <h3 className="mb-5 font-mono-tech text-[10px] tracking-wider text-text-tertiary">
              {isAr ? 'مراحل سير الطلب' : 'REQUEST PROGRESSION PIPELINE'}
            </h3>

            <div className="grid gap-3 sm:grid-cols-4">
              {CLIENT_STAGE_STEPS.map((step, idx) => {
                const stepNum = idx + 1
                const isPassed = progressInfo.currentStage > stepNum
                const isCurrent = progressInfo.currentStage === stepNum

                return (
                  <div
                    key={step.key}
                    className={`relative flex flex-col rounded-md border p-4 transition ${
                      isCurrent
                        ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                        : isPassed
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-border bg-bg/40 opacity-60'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold font-mono-tech ${
                          isCurrent
                            ? 'bg-accent text-accent-foreground'
                            : isPassed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-surface-raised text-text-tertiary'
                        }`}
                      >
                        {isPassed ? <Check className="h-3.5 w-3.5" /> : `0${stepNum}`}
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono-tech text-[9px] font-semibold text-accent">
                          {isAr ? 'الحالي' : 'ACTIVE'}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs font-semibold ${isCurrent ? 'text-fg' : isPassed ? 'text-fg' : 'text-text-tertiary'}`}>
                      {isAr ? step.labelAr : step.label}
                    </p>
                    <p className="mt-1 text-[10px] text-text-secondary">
                      {isAr ? step.descAr : step.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Key Metadata Grid ───────────────────────────────────────────── */}
        <div className="grid gap-4 border-b border-border p-6 sm:grid-cols-3 sm:p-8">
          <div className="rounded-md border border-border bg-bg/50 p-4">
            <span className="font-mono-tech text-[10px] tracking-wider text-text-tertiary">
              {isAr ? 'الخدمة المقدمة' : 'REQUESTED SERVICE'}
            </span>
            <p className="mt-1 text-sm font-semibold text-fg">{tracking.form_title}</p>
          </div>

          <div className="rounded-md border border-border bg-bg/50 p-4">
            <span className="font-mono-tech text-[10px] tracking-wider text-text-tertiary">
              {isAr ? 'تاريخ التقديم' : 'SUBMITTED ON'}
            </span>
            <p className="mt-1 text-sm font-semibold text-fg">{submittedDate}</p>
          </div>

          <div className="rounded-md border border-border bg-bg/50 p-4">
            <span className="font-mono-tech text-[10px] tracking-wider text-text-tertiary">
              {isAr ? 'آخر تحديث' : 'LAST ACTIVITY'}
            </span>
            <p className="mt-1 text-sm font-semibold text-fg">{updatedDate}</p>
          </div>
        </div>

        {/* ── What Happens Next Section ──────────────────────────────────── */}
        <div className="border-b border-border p-6 sm:p-8">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-fg">
              {isAr ? 'الخطوات القادمة' : 'What to Expect Next'}
            </h3>
          </div>

          <div className="rounded-md border border-border bg-bg/40 p-4 text-xs leading-relaxed text-text-secondary">
            {tracking.status === 'new' && (
              <p>
                {isAr
                  ? 'طلبك مدرج حالياً في قائمة المراجعة وسيقوم قائد الفريق المتخصص بدراسة المتطلبات الفنية والتواصل معك خلال مدة أقصاها يومي عمل.'
                  : 'Your request is in our qualification queue. A domain lead will review project specifications and reach out with kickoff steps within 1–2 business days.'}
              </p>
            )}
            {tracking.status === 'reviewing' && (
              <p>
                {isAr
                  ? 'فريقنا يقوم حالياً بدراسة النطاق الفني والجدول الزمني للبدء. سنتواصل معك بالنتائج والتوصيات قريباً.'
                  : 'Our design and technical team is actively sizing deliverables and timelines. You will hear from us shortly with a structured project proposal.'}
              </p>
            )}
            {tracking.status === 'need_information' && (
              <p>
                {isAr
                  ? 'نحتاج إلى بعض التفاصيل الإضافية لإكمال دراسة الطلب. يرجى مراجعة بريدك الإلكتروني والرد علينا، أو التواصل معنا مباشرة.'
                  : 'We have reached out via email with specific questions to clarify project scope. Once received, we will finalize your proposal immediately.'}
              </p>
            )}
            {tracking.status === 'qualified' && (
              <p>
                {isAr
                  ? 'تم تأهيل مشروعك بنجاح! نقوم الآن بتجهيز اتفاقية العمل والموارد المطلوبة لإطلاق المشروع.'
                  : 'Your request has met all qualification criteria. We are drafting the project agreement and assigning dedicated studio resources.'}
              </p>
            )}
            {tracking.status === 'approved' && (
              <p>
                {isAr
                  ? 'تمت الموافقة على الطلب من إدارة الاستوديو وجارٍ فتح مساحة العمل الخاصة بالمشروع.'
                  : 'Leadership approval is complete. We are setting up the project workspace and finalizing kickoff logistics.'}
              </p>
            )}
            {tracking.status === 'converted' && (
              <p>
                {isAr
                  ? 'تم تحويل طلبك بنجاح إلى مشروع إنتاجي نشط! فريق العمل بدأ التنفيذ وستتلقى التحديثات الدورية عبر قنوات التواصل المعتمدة.'
                  : 'Your request is now an active production project in our studio. The creative team is actively executing deliverables according to schedule.'}
              </p>
            )}
            {tracking.status === 'rejected' && (
              <p>
                {isAr
                  ? 'نعتذر عن عدم استطاعتنا تلبية هذا الطلب في الوقت الحالي. نشكرك على اهتمامك بخدماتنا ونتطلع للتعاون معك مستقبلاً.'
                  : 'We are unable to take on this project at this time. Thank you for your interest in our studio, and we hope to collaborate on future initiatives.'}
              </p>
            )}
            {tracking.status === 'archived' && (
              <p>
                {isAr
                  ? 'هذا الطلب مؤرشف. إذا كنت ترغب في بدء مشروع جديد، يمكنك تقديم طلب جديد عبر صفحة النماذج.'
                  : 'This submission has been archived. If you have a new initiative, feel free to submit a new service request anytime.'}
              </p>
            )}
          </div>
        </div>

        {/* ── Expected Response Time & Contact Information ────────────────── */}
        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-md border border-accent/20 bg-accent/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {isAr ? 'الوقت المتوقع للرد' : 'Expected Response Time'}
                </h4>
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
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {isAr ? 'معلومات التواصل المباشر' : 'Direct Contact & Inquiries'}
            </h4>
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

        {/* ── Footer Navigation ──────────────────────────────────────────── */}
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
              {isAr ? 'طلب جديد' : 'New Request'}
            </Link>
            <Link
              href="/portfolio"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 py-2 text-xs font-medium text-fg transition hover:border-line-light"
            >
              <Layers3 className="h-3.5 w-3.5" />
              {isAr ? 'سابقة الأعمال' : 'Portfolio'}
            </Link>
          </div>

          {onSearchAnother && (
            <button
              type="button"
              onClick={onSearchAnother}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg"
            >
              <FileText className="h-3.5 w-3.5" />
              {isAr ? 'البحث عن طلب آخر' : 'Track Another Request'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
