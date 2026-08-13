/**
 * portal — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { FileItem, FileRow } from './files'
import type { ProjectDeliveryStatus } from './projects'
import type { ProjectStatus } from './core'
import type { Profile } from './team'
import type { FormSubmission, SubmissionStatus } from './forms'
// ── Client portal collaboration (Session 18) ────────────────────────────────

// These tables are the only client-facing collaboration surface. Internal

// discussion stays in `comments`; internal delivery state stays in

// `project_deliveries`. Clients never write those tables directly.

export type ClientMessageKind = 'message' | 'feedback' | 'approval' | 'revision'

export type ClientApprovalAction = 'approved' | 'revision_requested' | 'feedback'

export type ClientFileSource = 'shared' | 'delivery' | 'both'


export type ClientSharedFileRow = {
  id: string
  project_id: string
  file_id: string
  shared_by: string | null
  note: string | null
  shared_at: string
}


export type ClientMessageRow = {
  id: string
  project_id: string
  author_id: string | null
  body: string
  kind: ClientMessageKind
  created_at: string
}


export type ClientApprovalRow = {
  id: string
  project_id: string
  delivery_id: string | null
  action: ClientApprovalAction
  message: string | null
  created_by: string | null
  created_at: string
}


export type ClientPortalFile = {
  id: string
  name: string
  type: FileRow['type']
  size: number
  mime_type: string | null
  storage_path: string | null
  created_at: string
  source: ClientFileSource
}


export type ClientPortalMessage = {
  id: string
  body: string
  kind: ClientMessageKind
  created_at: string
  mine: boolean
  author_label: string
  from_client: boolean
}


export type ClientPortalApproval = {
  id: string
  action: ClientApprovalAction
  message: string | null
  created_at: string
}


export type ClientPortalDeliverySummary = {
  id: string
  version: number
  status: ProjectDeliveryStatus
  delivered_at: string | null
  approval_state: 'approved_by_client' | 'revision_required' | 'awaiting_you' | 'not_ready'
}


export type ClientPortalCollaboration = {
  project_status: ProjectStatus
  archived: boolean
  can_approve: boolean
  can_request_revision: boolean
  delivery: ClientPortalDeliverySummary | null
  files: ClientPortalFile[]
  messages: ClientPortalMessage[]
  approvals: ClientPortalApproval[]
}


export type ClientSharedFile = ClientSharedFileRow

export type ClientMessage = ClientMessageRow

export type ClientApproval = ClientApprovalRow

export type ClientSharedFileWithFile = ClientSharedFile & {
  file?: FileItem | null
}

export type ClientMessageWithAuthor = ClientMessage & {
  author?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
}

export type ClientFormSubmission = FormSubmission & {
  form_templates?: { title: string; slug: string } | null
}


// ── Client portal (Session 17) ──────────────────────────────────────────────

// Sanitized rows returned by the client-scoped, SECURITY DEFINER portal RPCs.

// Deliberately narrower than ProjectRow: no owner, manager, team, budget, health,

// priority, archive state, or internal audit columns are exposed to clients.

export type ClientPortalProjectRow = {
  id: string
  name: string
  description: string | null
  type: string
  status: ProjectStatus
  progress: number
  phase: number
  phase_name: string | null
  start_date: string | null
  due_date: string | null
  reference_number: string | null
  created_at: string
  updated_at: string
}


export type ClientPortalClientRow = {
  id: string
  name: string
  email: string | null
  contact_person: string | null
  contact_position: string | null
}

export type PublicSubmissionTracking = {
  id: string
  reference_number: string
  tracking_token: string
  form_id: string
  form_title: string
  form_description: string | null
  status: SubmissionStatus
  client_status_label: string
  client_status_description: string
  stage_index: number
  submitted_at: string
  updated_at: string
  respondent_name: string | null
  company_name: string | null
  has_project: boolean
  expected_response_time: string
  contact_email: string
  contact_phone: string
  support_hours: string
}

export type ClientPortalProject = ClientPortalProjectRow

export type ClientPortalClient = ClientPortalClientRow

