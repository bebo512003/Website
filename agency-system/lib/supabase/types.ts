export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type AppRole = 'admin' | 'manager' | 'employee' | 'client'
export type ProfileStatus = 'active' | 'inactive'
export type ProjectStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'waiting-for-client'
  | 'in-review'
  | 'ready-for-delivery'
  | 'delivered'
  | 'completed'
  | 'on-hold'
  | 'cancelled'
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ProjectHealth = 'on-track' | 'at-risk' | 'off-track' | 'blocked'
export type TaskStatus = 'todo' | 'inprogress' | 'review' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: AppRole
  status: ProfileStatus
  employee_role_id: string | null
  role_id: string | null
  client_id: string | null
  agency_name: string | null
  agency_website: string | null
  phone: string | null
  whatsapp: string | null
  bio: string | null
  job_title: string | null
  department: string | null
  specialization: string | null
  location: string | null
  portfolio_url: string | null
  social_links: Json
  created_at: string
  updated_at: string
  must_change_password: boolean
  skills: string | null
  experience: string | null
  certifications: string | null
  previous_projects: string | null
  linkedin: string | null
  behance: string | null
  instagram: string | null
  facebook: string | null
  twitter: string | null
  personal_website: string | null
  other_social_links: Json
}

export type EmployeeRoleRow = {
  id: string
  key: string
  name: string
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PermissionRow = {
  id: string
  key: string
  name: string
  category: string
  description: string | null
  created_at: string
}

export type AppRoleRow = {
  id: string
  key: string
  name: string
  description: string | null
  is_system: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RolePermissionRow = {
  role_id: string
  permission_id: string
  created_at: string
}

export type AppRoleWithPermissions = AppRoleRow & { permission_keys: string[] }

export type ClientRow = {
  id: string
  name: string
  name_en: string | null
  type: 'enterprise' | 'smb' | 'individual' | 'potential'
  industry: string | null
  status: 'active' | 'inactive' | 'potential'
  contact_person: string | null
  contact_position: string | null
  email: string | null
  phone: string | null
  location: string | null
  website: string | null
  logo_url: string | null
  notes: string | null
  total_value: number
  project_count: number
  first_project_date: string | null
  last_interaction_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectRow = {
  id: string
  name: string
  description: string | null
  client_id: string
  type: string
  priority: ProjectPriority
  status: ProjectStatus
  health: ProjectHealth
  phase: number
  phase_name: string | null
  progress: number
  budget: number | null
  currency: string
  start_date: string | null
  due_date: string | null
  completed_date: string | null
  owner_id: string | null
  manager_id: string | null
  source_submission_id: string | null
  archived_at: string | null
  archived_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectMemberRow = {
  project_id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
}

export type TaskRow = {
  id: string
  title: string
  description: string | null
  project_id: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
  completed_date: string | null
  tags: string[]
  comments_count: number
  attachments_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Task activity (Session 13) ──────────────────────────────────────────────
export type TaskActivityEventType =
  | 'note'
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assignee_changed'
  | 'due_date_changed'
  | 'title_changed'
  | 'description_changed'
  | 'project_changed'

export type TaskActivityRow = {
  id: string
  task_id: string
  project_id: string
  actor_id: string | null
  event_type: TaskActivityEventType
  old_value: string | null
  new_value: string | null
  metadata: Json
  created_at: string
}

// ── Project activity (Session 14) ──────────────────────────────────────────
// Project-level audit events, distinct from task-level events (task_activity).
// Client-facing discussion lives in `comments` — never in this feed.
export type ProjectActivityEventType =
  | 'created'
  | 'submission_converted'
  | 'owner_changed'
  | 'manager_changed'
  | 'member_added'
  | 'member_removed'
  | 'status_changed'
  | 'deadline_changed'
  | 'file_uploaded'
  | 'file_deleted'
  | 'delivery_prepared'
  | 'delivery_ready'
  | 'delivery_sent'
  | 'delivery_file_added'
  | 'delivery_file_removed'
  | 'revision_requested'
  | 'approval_recorded'
  | 'archived'
  | 'unarchived'
  | 'file_shared'
  | 'file_unshared'
  | 'client_feedback'
  | 'client_approved'
  | 'client_revision_requested'

export type ProjectDeliveryStatus =
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'revision_requested'
  | 'approved'
  | 'superseded'

export type ProjectDeliveryApprovalState =
  | 'not_requested'
  | 'awaiting_client'
  | 'approved_internally'
  | 'revision_required'
  | 'approved_by_client'

export type ProjectDeliveryRow = {
  id: string
  project_id: string
  version: number
  status: ProjectDeliveryStatus
  notes: string | null
  delivered_at: string | null
  delivered_by: string | null
  approval_state: ProjectDeliveryApprovalState
  approval_recorded_by: string | null
  approval_recorded_at: string | null
  approval_note: string | null
  revision_note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectDeliveryFileRow = {
  delivery_id: string
  file_id: string
  added_by: string | null
  added_at: string
}

export type ProjectActivityRow = {
  id: string
  project_id: string
  actor_id: string | null
  event_type: ProjectActivityEventType
  old_value: string | null
  new_value: string | null
  metadata: Json
  created_at: string
}

/** One row of the list_task_assignees RPC: a valid task assignee candidate. */
export type TaskAssigneeRow = {
  id: string
  full_name: string | null
  email: string
  job_title: string | null
  role: AppRole
  is_member: boolean
}

export type FileRow = {
  id: string
  name: string
  type: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'video' | 'other'
  size: number
  mime_type: string | null
  storage_path: string | null
  project_id: string | null
  client_id: string | null
  uploaded_by: string | null
  starred: boolean
  created_at: string
  updated_at: string
}

export type InteractionRow = {
  id: string
  type: 'meeting' | 'email' | 'call' | 'note' | 'other'
  title: string
  description: string | null
  client_id: string
  project_id: string | null
  date: string
  created_by: string | null
  created_at: string
}

export type CommentRow = {
  id: string
  content: string
  entity_type: 'project' | 'task' | 'client' | 'file'
  entity_id: string
  author_id: string | null
  created_at: string
  updated_at: string
}

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

// ── Public company portfolio ────────────────────────────────────────────────
// Portfolio records are deliberately separate from the internal `projects`
// table. Public reads are restricted by RLS to published, non-archived rows.
export type PortfolioCategoryRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
  display_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PortfolioProjectRow = {
  id: string
  title: string
  slug: string
  cover_image_path: string | null
  description: string | null
  client_name: string | null
  category_id: string | null
  services: string[]
  project_date: string | null
  external_url: string | null
  featured: boolean
  published: boolean
  archived: boolean
  display_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PortfolioProjectImageRow = {
  id: string
  project_id: string
  storage_path: string
  alt_text: string | null
  display_order: number
  uploaded_by: string | null
  created_at: string
}

export type PortfolioPublicRpcRow = {
  id: string
  title: string
  slug: string
  cover_image_path: string | null
  description: string | null
  client_name: string | null
  category_id: string | null
  category_name: string | null
  category_slug: string | null
  services: string[]
  project_date: string | null
  external_url: string | null
  featured: boolean
  display_order: number
  images: Json
}

/** The typed Database contract is generated from the real schema — see
 * lib/supabase/database.types.ts (scripts/generate-types.mjs). It is re-exported
 * here so existing imports of `Database` from '@/lib/supabase/types' keep working. */
import type { Database } from './database.types'

export type { Database }

export type Profile = ProfileRow
export type ProfileUpdate = Partial<Pick<ProfileRow, 'full_name' | 'avatar_url' | 'agency_name' | 'agency_website' | 'phone' | 'bio'>>
export type EmployeeRole = EmployeeRoleRow
export type EmployeeRoleInsert = Database['public']['Tables']['employee_roles']['Insert']
export type EmployeeRoleUpdate = Database['public']['Tables']['employee_roles']['Update']
export type Client = ClientRow
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type ClientUpdate = Database['public']['Tables']['clients']['Update']
export type Project = ProjectRow
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type ProjectUpdate = Database['public']['Tables']['projects']['Update']
export type ProjectMember = ProjectMemberRow
export type Task = TaskRow
export type TaskInsert = Database['public']['Tables']['tasks']['Insert']
export type TaskUpdate = Database['public']['Tables']['tasks']['Update']
export type FileItem = FileRow
export type FileInsert = Database['public']['Tables']['files']['Insert']
export type Interaction = InteractionRow
export type InteractionInsert = Database['public']['Tables']['interactions']['Insert']
export type Comment = CommentRow
export type CommentInsert = Database['public']['Tables']['comments']['Insert']
export type ClientSharedFile = ClientSharedFileRow
export type ClientMessage = ClientMessageRow
export type ClientApproval = ClientApprovalRow
export type CommentWithAuthor = Comment & {
  author?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null
}
export type ClientSharedFileWithFile = ClientSharedFile & {
  file?: FileItem | null
}
export type ClientMessageWithAuthor = ClientMessage & {
  author?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
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
export type Notification = NotificationRow
export type Permission = PermissionRow
export type AccessRole = AppRoleRow
export type RolePermission = RolePermissionRow
export type PortfolioCategory = PortfolioCategoryRow
export type PortfolioCategoryInsert = Database['public']['Tables']['portfolio_categories']['Insert']
export type PortfolioCategoryUpdate = Database['public']['Tables']['portfolio_categories']['Update']
export type PortfolioProject = PortfolioProjectRow
export type PortfolioProjectInsert = Database['public']['Tables']['portfolio_projects']['Insert']
export type PortfolioProjectUpdate = Database['public']['Tables']['portfolio_projects']['Update']
export type PortfolioProjectImage = PortfolioProjectImageRow
export type PortfolioProjectImageInsert = Database['public']['Tables']['portfolio_project_images']['Insert']

export type PortfolioImageWithUrl = PortfolioProjectImage & { image_url: string | null }
export type PortfolioProjectWithRelations = PortfolioProject & {
  portfolio_categories: Pick<PortfolioCategory, 'id' | 'name' | 'slug' | 'is_active'> | null
  portfolio_project_images: PortfolioImageWithUrl[]
}

export type ProjectWithClient = Project & {
  clients: Pick<Client, 'id' | 'name'> | null
  owner?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  manager?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}
export type TaskWithRelations = Task & {
  projects: Pick<Project, 'id' | 'name'> | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}
export type TaskActivity = TaskActivityRow & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}
export type TaskAssignee = TaskAssigneeRow
export type ProjectActivity = ProjectActivityRow & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}
export type ProjectDelivery = ProjectDeliveryRow
export type ProjectDeliveryFile = ProjectDeliveryFileRow & {
  file?: FileItem | null
}
export type ProjectDeliveryWithFiles = ProjectDelivery & {
  files: ProjectDeliveryFile[]
}

// ── Operational analytics (Session 24) ─────────────────────────────────────
// Aggregated workflow data returned by get_operational_analytics. Deliberately
// contains no budget, rate, invoice, client value, revenue, or cost fields.
export type OperationalAnalytics = {
  window: {
    days: number
    start_date: string
    end_date: string
    previous_start_date: string
    previous_end_date: string
    generated_at: string
  }
  scope: {
    all_projects: boolean
    submissions_included: boolean
  }
  submissions: {
    volume: number
    previous_volume: number
    volume_change_percent: number | null
    converted: number
    conversion_rate: number | null
    responded: number
    awaiting_response: number
    median_response_hours: number | null
    by_form: Array<{
      form_id: string
      title: string
      submissions: number
      converted: number
      conversion_rate: number
    }>
    trend: Array<{
      period_start: string
      submissions: number
      converted: number
    }>
  }
  projects: {
    active: number
    overdue: number
    by_status: Array<{ status: ProjectStatus; count: number }>
  }
  tasks: {
    open: number
    overdue: number
    unassigned: number
    due_next_7_days: number
    overdue_items: Array<{
      id: string
      title: string
      project_id: string
      project_name: string
      assignee_id: string | null
      assignee_name: string
      due_date: string
      days_overdue: number
      priority: TaskPriority
    }>
  }
  team_workload: Array<{
    user_id: string
    name: string
    job_title: string | null
    active_projects: number
    open_tasks: number
    overdue_tasks: number
    due_next_7_days: number
    in_review_tasks: number
  }>
  delivery: {
    delivered: number
    scheduled: number
    on_time: number
    late: number
    no_deadline: number
    on_time_rate: number | null
    revision_projects: number
    median_cycle_days: number | null
    median_variance_days: number | null
  }
}

export type FileWithProject = FileItem & {
  projects: Pick<Project, 'id' | 'name'> | null
  is_delivery?: boolean
}
export type ClientPortalProject = ClientPortalProjectRow
export type ClientPortalClient = ClientPortalClientRow
