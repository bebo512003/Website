'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SubmissionContact } from './submission-contact'
import { REQUEST_RESPONSE_TIME } from '@/lib/contact'
import { projectDeskPath, SELECTED_WORK_PATH } from '@/lib/site'
import { PublicEyebrow, publicPanelClassName } from '@/components/public/public-page-sections'
import { secondaryButtonClassName } from '@/components/ui/page'
import {
  Copy,
  Clock,
  Check,
  Printer,
  AlertCircle,
  FileText,
  Layers3,
  Home,
  CheckCheck,
} from 'lucide-react'
import type { PublicSubmissionTracking } from '@/lib/supabase/types'
import {
  CLIENT_STAGE_STEPS,
  CLIENT_STATUS_DESCRIPTIONS,
  CLIENT_STATUS_LABELS_AR,
  getClientStageProgress,
  publicTrackingPath,
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

  const statusLabel = isAr ? CLIENT_STATUS_LABELS_AR[tracking.status] || tracking.client_status_label : tracking.client_status_label
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
      const url = `${origin}${publicTrackingPath(tracking.reference_number, lang)}`
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
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'} lang={lang}>
      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <div className={publicPanelClassName}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-6 sm:p-8">
          <div>
            <PublicEyebrow>{isAr ? 'الرقم المرجعي' : 'Request reference'}</PublicEyebrow>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="wrap-anywhere font-mono text-xl font-medium text-fg sm:text-2xl" dir="ltr">
                {tracking.reference_number}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyRef()}
                className={secondaryButtonClassName}
                title={isAr ? 'نسخ رقم المرجع' : 'Copy reference number'}
              >
                {copiedRef ? <Check className="h-3.5 w-3.5 text-fg" /> : <Copy className="h-3.5 w-3.5" />}
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
              className={secondaryButtonClassName}
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-fg" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedLink ? (isAr ? 'تم نسخ الرابط' : 'Link Copied!') : (isAr ? 'نسخ الرابط' : 'Share Link')}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className={secondaryButtonClassName}
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
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
            ) : tracking.status === 'converted' ? (
              <CheckCheck className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
            ) : tracking.status === 'rejected' ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            ) : (
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-fg">
                {isAr ? 'الحالة الحالية للطلب' : 'Current Status'}: {statusLabel}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{statusDesc}</p>
              {tracking.status === 'need_information' && (
                <p className="mt-2 text-xs font-medium text-text-secondary">
                  {isAr
                    ? 'يرجى مراجعة بريدك الإلكتروني للرد على استفسارات الفريق، أو التواصل معنا عبر معلومات الاتصال أدناه.'
                    : 'Please check your email inbox to reply to our team’s questions, or contact us using the info below.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Multi-Stage Pipeline Stepper ───────────────────────────────── */}
        {!progressInfo.isDeclined && (
          <div className="border-b border-border p-6 sm:p-8">
            <h3 className="mb-5 type-label text-text-secondary">
              {isAr ? 'مراحل سير الطلب' : 'Request stages'}
            </h3>

            <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {CLIENT_STAGE_STEPS.map((step, idx) => {
                const stepNum = idx + 1
                const isPassed = progressInfo.currentStage > stepNum
                const isCurrent = progressInfo.currentStage === stepNum

                return (
                  <li
                    key={step.key}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`border-t-2 pt-3 ${isCurrent ? 'border-accent' : isPassed ? 'border-line-light' : 'border-border'}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center font-mono text-xs font-medium ${
                          isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : isPassed
                            ? 'text-fg'
                            : 'bg-surface-raised text-text-tertiary'
                        }`}
                      >
                        {isPassed ? <Check className="h-3.5 w-3.5" /> : `0${stepNum}`}
                      </span>
                      {isCurrent && (
                        <span className="text-xs font-semibold text-accent">
                          {isAr ? 'الحالي' : 'ACTIVE'}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs font-semibold ${isCurrent ? 'text-fg' : isPassed ? 'text-fg' : 'text-text-tertiary'}`}>
                      {isAr ? step.labelAr : step.label}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {isAr ? step.descAr : step.desc}
                    </p>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        <dl className="grid gap-4 border-b border-border p-6 sm:grid-cols-3 sm:p-8">
          <div>
            <dt className="type-label text-text-secondary">{isAr ? 'الخدمة المقدمة' : 'Requested service'}</dt>
            <dd className="mt-2 text-sm font-medium text-fg">{tracking.form_title}</dd>
          </div>
          <div>
            <dt className="type-label text-text-secondary">{isAr ? 'تاريخ التقديم' : 'Submitted on'}</dt>
            <dd className="mt-2 text-sm font-medium text-fg"><time dateTime={tracking.submitted_at}>{submittedDate}</time></dd>
          </div>
          <div>
            <dt className="type-label text-text-secondary">{isAr ? 'آخر تحديث' : 'Last activity'}</dt>
            <dd className="mt-2 text-sm font-medium text-fg"><time dateTime={tracking.updated_at}>{updatedDate}</time></dd>
          </div>
        </dl>

        {/* ── What Happens Next Section ──────────────────────────────────── */}
        <div className="p-6 sm:p-8">
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">
              {isAr ? 'الخطوات القادمة' : 'What to Expect Next'}
            </h3>
          </div>

          <div className="max-w-prose text-sm leading-6 text-text-secondary">
            {tracking.status === 'new' && (
              <p>
                {isAr
                  ? `طلبك في قائمة المراجعة. سنراجع المتطلبات ونتواصل معك خلال ${REQUEST_RESPONSE_TIME.ar}.`
                  : `Your request is in the review queue. We’ll review the requirements and get back to you within ${REQUEST_RESPONSE_TIME.en}.`}
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
                  ? 'تم تأهيل مشروعك. نقوم الآن بتجهيز اتفاقية العمل والموارد المطلوبة لإطلاق المشروع.'
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
                  ? 'تحوّل طلبك إلى مشروع قيد التنفيذ. فريق العمل بدأ التنفيذ وستتلقى التحديثات الدورية عبر قنوات التواصل المعتمدة.'
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

        <SubmissionContact lang={lang} />

        {/* ── Footer Navigation ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className={secondaryButtonClassName}
            >
              <Home className="h-3.5 w-3.5" />
              {isAr ? 'الرئيسية' : 'Home'}
            </Link>
            <a
              href={projectDeskPath(lang)}
              className={secondaryButtonClassName}
            >
              <FileText className="h-3.5 w-3.5" />
              {isAr ? 'طلب جديد' : 'New Request'}
            </a>
            <a
              href={SELECTED_WORK_PATH}
              className={secondaryButtonClassName}
            >
              <Layers3 className="h-3.5 w-3.5" />
              {isAr ? 'سابقة الأعمال' : 'Portfolio'}
            </a>
          </div>

          {onSearchAnother && (
            <button
              type="button"
              onClick={onSearchAnother}
              className={secondaryButtonClassName}
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
