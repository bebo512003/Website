/**
 * forms — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
import type { Json } from './core'
import type { Profile } from './team'
// ── Dynamic form builder (Phase D) ──────────────────────────────────────────

export type FormStatus = 'draft' | 'published' | 'disabled' | 'archived'

export type SubmissionStatus =
  | 'new' | 'reviewing' | 'need_information'
  | 'qualified' | 'rejected' | 'approved' | 'converted' | 'archived'

export type FormQuestionType =
  | 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'yes_no'
  | 'dropdown' | 'number' | 'date' | 'file_upload' | 'rating'

export type FormQuestionMapTo = 'name' | 'email' | 'phone' | 'company'


export type FormTemplateRow = {
  id: string
  slug: string
  title: string
  description: string | null
  status: FormStatus
  version: number
  settings: Json
  created_by: string | null
  created_at: string
  updated_at: string
}


export type FormQuestionRow = {
  id: string
  form_id: string
  question_type: FormQuestionType
  label: string
  help_text: string | null
  placeholder: string | null
  required: boolean
  options: Json
  config: Json
  map_to: FormQuestionMapTo | null
  position: number
  created_at: string
  updated_at: string
}


export type FormSubmissionRow = {
  id: string
  reference_number: string
  tracking_token: string
  form_id: string
  form_version: number
  status: SubmissionStatus
  respondent_name: string | null
  respondent_email: string | null
  respondent_phone: string | null
  company_name: string | null
  client_id: string | null
  project_id: string | null
  reviewer_id: string | null
  reviewed_at: string | null
  converted_at: string | null
  converted_by: string | null
  created_by: string | null
  submitted_at: string
  created_at: string
  updated_at: string
}


export type FormSubmissionAnswerRow = {
  id: string
  submission_id: string
  question_id: string | null
  question_snapshot: Json
  value: Json
  created_at: string
}


export type FormSubmissionAttachmentRow = {
  id: string
  submission_id: string
  question_id: string | null
  name: string
  size: number
  mime_type: string | null
  storage_path: string
  uploaded_by: string | null
  created_at: string
}


export type FormSubmissionNoteRow = {
  id: string
  submission_id: string
  author_id: string
  note: string
  created_at: string
  updated_at: string
}


export type FormSubmissionEventType =
  | 'created'
  | 'status_changed'
  | 'reviewer_assigned'
  | 'reviewer_unassigned'
  | 'reviewer_reassigned'
  | 'note_added'
  | 'note_deleted'
  | 'archived'
  | 'restored'
  | 'converted_to_project'


export type FormSubmissionEventRow = {
  id: string
  submission_id: string
  actor_id: string | null
  event_type: FormSubmissionEventType
  old_value: string | null
  new_value: string | null
  note: string | null
  metadata: Json
  created_at: string
}


export type FormTemplate = FormTemplateRow

export type FormTemplateInsert = Database['public']['Tables']['form_templates']['Insert']

export type FormTemplateUpdate = Database['public']['Tables']['form_templates']['Update']

export type FormQuestion = FormQuestionRow

export type FormQuestionInsert = Database['public']['Tables']['form_questions']['Insert']

export type FormQuestionUpdate = Database['public']['Tables']['form_questions']['Update']

export type FormSubmission = FormSubmissionRow

export type FormSubmissionAnswer = FormSubmissionAnswerRow

export type FormSubmissionAttachment = FormSubmissionAttachmentRow

export type FormSubmissionNote = FormSubmissionNoteRow & {
  author?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}

export type FormSubmissionEvent = FormSubmissionEventRow & {
  actor?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}

export type FormSubmissionNoteInsert = Database['public']['Tables']['form_submission_notes']['Insert']

export type FormSubmissionEventInsert = Database['public']['Tables']['form_submission_events']['Insert']

/** Template row plus aggregate counts returned by the admin list query. */

export type FormTemplateWithCounts = FormTemplate & {
  form_questions: { count: number }[]
  form_submissions: { count: number }[]
}

/** Minimal published-form contract used by public pages. Submission counts and
 * admin-only lifecycle fields are deliberately not part of the public payload. */

export type PublicFormTemplate = Pick<FormTemplate, 'id' | 'slug' | 'title' | 'description' | 'status'>

export type PublicFormTemplateSummary = PublicFormTemplate & {
  form_questions: { count: number }[]
}
