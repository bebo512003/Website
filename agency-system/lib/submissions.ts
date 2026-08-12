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
