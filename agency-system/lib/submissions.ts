// Submission workflow metadata shared by the Admin Submission Inbox, the per-form
// Responses tab and the client portal. The source of truth for which statuses
// exist is the form_submissions.status CHECK constraint in Postgres; this module
// only labels and colours them for the UI.
import type { SubmissionStatus } from '@/lib/supabase/types'

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'new',
  'reviewing',
  'need_information',
  'qualified',
  'approved',
  'converted',
  'rejected',
  'archived',
]

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  need_information: 'Need Information',
  qualified: 'Qualified',
  approved: 'Approved',
  converted: 'Converted',
  rejected: 'Rejected',
  archived: 'Archived',
}

export const SUBMISSION_STATUS_STYLES: Record<SubmissionStatus, string> = {
  new: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
  reviewing: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  need_information: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
  qualified: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400',
  approved: 'border-green-500/30 bg-green-500/5 text-green-400',
  converted: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
  rejected: 'border-red-500/30 bg-red-500/5 text-red-400',
  archived: 'border-border bg-surface-raised text-text-tertiary',
}

export function submissionStatusLabel(status: string): string {
  return SUBMISSION_STATUS_LABELS[status as SubmissionStatus] || status || 'New'
}

export function submissionStatusStyle(status: string): string {
  return SUBMISSION_STATUS_STYLES[status as SubmissionStatus] || 'border-border bg-surface-raised text-text-tertiary'
}

export const SUBMISSION_STATUS_DESCRIPTIONS: Record<SubmissionStatus, string> = {
  new: 'Fresh response received and awaiting initial review or reviewer assignment.',
  reviewing: 'Under active evaluation and qualification by the assigned reviewer.',
  need_information: 'Awaiting further clarification or supplementary materials from submitter.',
  qualified: 'Successfully qualified and meets criteria for engagement.',
  approved: 'Reviewed and approved by team leadership.',
  converted: 'Converted to an active project.',
  rejected: 'Does not meet qualification criteria or declined.',
  archived: 'Archived for record-keeping and excluded from active workflow.',
}

export const SUBMISSION_EVENT_LABELS: Record<string, string> = {
  created: 'Submission Received',
  status_changed: 'Status Changed',
  reviewer_assigned: 'Reviewer Assigned',
  reviewer_reassigned: 'Reviewer Reassigned',
  reviewer_unassigned: 'Reviewer Unassigned',
  note_added: 'Review Note Added',
  note_deleted: 'Review Note Deleted',
  archived: 'Archived',
  restored: 'Restored',
  converted_to_project: 'Converted to Project',
}

export function submissionEventLabel(eventType: string): string {
  return SUBMISSION_EVENT_LABELS[eventType] || eventType.replace(/_/g, ' ')
}

/** Sort order: active workflow items first (new → reviewing → need info), then
 * outcome items (qualified/approved/converted), then rejected/archived. */
const STATUS_RANK: Record<string, number> = {
  new: 0,
  reviewing: 1,
  need_information: 2,
  qualified: 3,
  approved: 4,
  converted: 5,
  rejected: 6,
  archived: 7,
}

export function submissionStatusRank(status: string): number {
  return STATUS_RANK[status] ?? 99
}

/** Readable client info line used across the inbox (kept deliberately concise). */
export function submissionClientLabel(submission: {
  respondent_name?: string | null
  respondent_email?: string | null
  respondent_phone?: string | null
  company_name?: string | null
}): string {
  return [submission.company_name, submission.respondent_name, submission.respondent_email, submission.respondent_phone]
    .filter(Boolean)
    .join(' · ') || 'Anonymous respondent'
}

// ── Public Tracking & Confirmation Metadata (Session 16) ───────────────────

export const AGENCY_CONTACT = {
  email: 'support@agencyos.studio',
  phone: '+1 (555) 019-2834',
  hours: 'Monday – Friday, 9:00 AM – 6:00 PM EST',
  hoursAr: 'من الإثنين إلى الجمعة، 9:00 ص – 6:00 م',
  expectedResponse: '1–2 business days (24–48 hours)',
  expectedResponseAr: 'خلال 1–2 يوم عمل (24–48 ساعة)',
}

export const CLIENT_STATUS_DESCRIPTIONS: Record<string, { en: string; ar: string }> = {
  new: {
    en: 'Your request has been received and logged in our system. It is currently in the initial review queue.',
    ar: 'تم استلام طلبك وتسجيله بنجاح في النظام، وهو حالياً في قائمة المراجعة الأولية.',
  },
  reviewing: {
    en: 'Our creative and technical specialists are actively evaluating your requirements, scope, and timeline.',
    ar: 'يقوم فريقنا بمراجعة متطلبات المشروع ونطاق العمل والجدول الزمني بعناية.',
  },
  need_information: {
    en: 'We need additional details to proceed. Please check your email for questions from our review team.',
    ar: 'نحتاج إلى بعض التوضيحات الإضافية لمتابعة الطلب. يرجى مراجعة بريدك الإلكتروني.',
  },
  qualified: {
    en: 'Your request has been qualified and approved for engagement planning and proposal preparation.',
    ar: 'تم تأهيل طلبك والموافقة المبدئية عليه للبدء في تجهيز خطة العمل والعرض.',
  },
  approved: {
    en: 'Your request has been approved by team leadership. Project kickoff preparations are underway.',
    ar: 'تم اعتماد طلبك من إدارة الفريق وجارٍ تجهيز إجراءات بدء المشروع.',
  },
  converted: {
    en: 'Your request has been converted to an active project in our production pipeline.',
    ar: 'تم تحويل طلبك رسمياً إلى مشروع نشط قيد التنفيذ في استوديو العمل.',
  },
  rejected: {
    en: 'We are currently unable to accept this request due to capacity or scope constraints. Thank you for reaching out.',
    ar: 'نعتذر عن عدم إمكانية استلام هذا الطلب حالياً نظراً لضغط العمل أو متطلبات النطاق. شكراً لتواصلك معنا.',
  },
  archived: {
    en: 'This submission has been archived or closed.',
    ar: 'تمت أرشفة هذا الطلب أو إغلاقه.',
  },
}

export const CLIENT_STAGE_STEPS = [
  { key: 'received', label: 'Received', labelAr: 'تم الاستلام', desc: 'Request logged', descAr: 'تسجيل الطلب' },
  { key: 'reviewing', label: 'In Review', labelAr: 'قيد المراجعة', desc: 'Scope evaluation', descAr: 'تقييم النطاق' },
  { key: 'qualified', label: 'Qualified', labelAr: 'مؤهل ومعتمد', desc: 'Planning & scoping', descAr: 'التخطيط والاعتماد' },
  { key: 'converted', label: 'In Production', labelAr: 'قيد التنفيذ', desc: 'Active project', descAr: 'مشروع نشط' },
]

export function getClientStageProgress(status: string): {
  currentStage: number // 1 to 4 (or 0 for terminal non-success)
  percent: number
  isTerminal: boolean
  isDeclined: boolean
} {
  switch (status) {
    case 'new':
      return { currentStage: 1, percent: 25, isTerminal: false, isDeclined: false }
    case 'reviewing':
    case 'need_information':
      return { currentStage: 2, percent: 50, isTerminal: false, isDeclined: false }
    case 'qualified':
    case 'approved':
      return { currentStage: 3, percent: 75, isTerminal: false, isDeclined: false }
    case 'converted':
      return { currentStage: 4, percent: 100, isTerminal: true, isDeclined: false }
    case 'rejected':
      return { currentStage: 0, percent: 0, isTerminal: true, isDeclined: true }
    case 'archived':
      return { currentStage: 0, percent: 0, isTerminal: true, isDeclined: false }
    default:
      return { currentStage: 1, percent: 25, isTerminal: false, isDeclined: false }
  }
}

