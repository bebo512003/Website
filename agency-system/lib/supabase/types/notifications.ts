/**
 * notifications — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Json } from './core'
export type NotificationEvent =
  | 'submission.created'
  | 'submission.assigned'
  | 'submission.status_changed'
  | 'project.created'
  | 'project.assigned'
  | 'team_member.assigned'
  | 'task.assigned'
  | 'task.updated'
  | 'client.feedback'
  | 'client.approval'
  | 'client.revision'
  | 'file.shared'
  | 'delivery.ready'
  | 'task.due_soon'
  | 'task.due_today'
  | 'task.overdue'
  | 'project.deadline_approaching'
  | 'project.overdue'


export type NotificationType =
  | 'info'
  | 'assignment'
  | 'project_update'
  | 'task_update'
  | 'task_assignment'
  | 'form_submission'
  | 'submission'
  | 'client_feedback'
  | 'client_approval'
  | 'client_revision'
  | 'file_shared'
  | 'delivery_ready'
  | 'deadline_reminder'


export type NotificationMetadata = {
  submission_id?: string
  form_id?: string
  form_name?: string
  client_name?: string
  respondent_name?: string | null
  respondent_email?: string | null
  respondent_phone?: string | null
  company_name?: string | null
  project_id?: string | null
  project_name?: string | null
  task_id?: string | null
  task_title?: string | null
  assigned_by?: string | null
  due_date?: string | null
  priority?: string | null
  status?: string | null
  progress?: number | null
  phase?: number | null
  contact_email?: string | null
  contact_phone?: string | null
  services?: string[] | null
  submitted_at?: string | null
  assigned_at?: string | null
  [key: string]: unknown
}


export type ReminderKind =
  | 'task.due_soon'
  | 'task.due_today'
  | 'task.overdue'
  | 'task.overdue.escalation'
  | 'project.deadline_approaching'
  | 'project.overdue'


export type ReminderEventRow = {
  id: string
  kind: ReminderKind
  entity_type: 'task' | 'project'
  entity_id: string
  recipient_id: string | null
  notification_id: string | null
  due_date: string
  dedupe_key: string
  role: 'assignee' | 'manager' | 'owner'
  created_at: string
}


// ── Transactional email (Session 21) ────────────────────────────────────────

// Server-side outbox flushed by GET /api/cron/emails and updated by the

// provider webhook. Rows are written only by SECURITY DEFINER triggers and

// the service role — never by browser code.

export type EmailTemplateKey =
  | 'submission-received'
  | 'client-invitation'
  | 'delivery-ready'
  | 'revision-approval-update'
  | 'new-submission'
  | 'task-assigned'
  | 'project-assigned'
  | 'project-update'


export type EmailOutboxStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'skipped'


export type EmailOutboxRow = {
  id: string
  template_key: EmailTemplateKey
  recipient_email: string
  recipient_user_id: string | null
  payload: Json
  dedupe_key: string
  status: EmailOutboxStatus
  attempts: number
  provider: string | null
  provider_message_id: string | null
  last_error: string | null
  next_attempt_at: string
  sent_at: string | null
  delivered_at: string | null
  created_at: string
}


export type EmailDeliveryEventRow = {
  id: string
  provider: string
  provider_message_id: string | null
  event_type: string
  recipient_email: string | null
  payload: Json
  received_at: string
}


export type NotificationRow = {
  id: string
  recipient_id: string
  actor_id: string | null
  project_id: string | null
  submission_id: string | null
  task_id: string | null
  type: NotificationType
  event: NotificationEvent | null
  title: string
  message: string
  action_url: string | null
  metadata: NotificationMetadata | Json
  dedupe_key: string | null
  read_at: string | null
  created_at: string
}


export type Notification = NotificationRow
