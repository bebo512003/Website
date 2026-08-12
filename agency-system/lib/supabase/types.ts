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

export type NotificationType =
  | 'info'
  | 'assignment'
  | 'project_update'
  | 'task_update'
  | 'task_assignment'
  | 'form_submission'
  | 'submission'

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

export type NotificationRow = {
  id: string
  recipient_id: string
  actor_id: string | null
  project_id: string | null
  submission_id: string | null
  task_id: string | null
  type: NotificationType
  title: string
  message: string
  action_url: string | null
  metadata: NotificationMetadata | Json
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

type Relationship = { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }

type TableDefinition<Row extends Record<string, unknown>, Insert extends Record<string, unknown>, Update extends Record<string, unknown> = Partial<Insert>, Relationships extends Relationship[] = []> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Relationships
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDefinition<ProfileRow, {
        id: string; email: string; full_name?: string | null; avatar_url?: string | null; role?: AppRole; agency_name?: string | null; agency_website?: string | null; phone?: string | null; bio?: string | null; created_at?: string; updated_at?: string; status?: ProfileStatus; employee_role_id?: string | null; client_id?: string | null; role_id?: string | null; job_title?: string | null; department?: string | null; specialization?: string | null; location?: string | null; portfolio_url?: string | null; whatsapp?: string | null; social_links?: Json; must_change_password?: boolean; skills?: string | null; experience?: string | null; certifications?: string | null; previous_projects?: string | null; linkedin?: string | null; behance?: string | null; instagram?: string | null; facebook?: string | null; twitter?: string | null; personal_website?: string | null; other_social_links?: Json
      }, Partial<ProfileRow>, [
        { foreignKeyName: 'profiles_employee_role_id_fkey'; columns: ['employee_role_id']; isOneToOne: false; referencedRelation: 'employee_roles'; referencedColumns: ['id'] },
        { foreignKeyName: 'profiles_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] },
        { foreignKeyName: 'profiles_role_id_fkey'; columns: ['role_id']; isOneToOne: false; referencedRelation: 'app_roles'; referencedColumns: ['id'] },
      ]>
      employee_roles: TableDefinition<EmployeeRoleRow, {
        id?: string; key: string; name: string; description?: string | null; is_active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<EmployeeRoleRow>, [{ foreignKeyName: 'employee_roles_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }]>
      permissions: TableDefinition<PermissionRow, {
        id?: string; key: string; name: string; category?: string; description?: string | null; created_at?: string
      }, Partial<PermissionRow>>
      app_roles: TableDefinition<AppRoleRow, {
        id?: string; key: string; name: string; description?: string | null; is_system?: boolean; is_active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<AppRoleRow>>
      role_permissions: TableDefinition<RolePermissionRow, {
        role_id: string; permission_id: string; created_at?: string
      }, Partial<RolePermissionRow>>
      clients: TableDefinition<ClientRow, {
        id?: string; name: string; name_en?: string | null; type?: ClientRow['type']; industry?: string | null; status?: ClientRow['status']; contact_person?: string | null; contact_position?: string | null; email?: string | null; phone?: string | null; location?: string | null; website?: string | null; logo_url?: string | null; notes?: string | null; total_value?: number; project_count?: number; first_project_date?: string | null; last_interaction_date?: string | null; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<ClientRow>, [{ foreignKeyName: 'clients_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }]>
      projects: TableDefinition<ProjectRow, {
        id?: string; name: string; description?: string | null; client_id: string; type?: string; priority?: ProjectPriority; status?: ProjectStatus; health?: ProjectHealth; phase?: number; phase_name?: string | null; progress?: number; budget?: number | null; currency?: string; start_date?: string | null; due_date?: string | null; completed_date?: string | null; owner_id?: string | null; manager_id?: string | null; source_submission_id?: string | null; archived_at?: string | null; archived_by?: string | null; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<ProjectRow>, [
        { foreignKeyName: 'projects_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] },
        { foreignKeyName: 'projects_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'projects_manager_id_fkey'; columns: ['manager_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'projects_source_submission_id_fkey'; columns: ['source_submission_id']; isOneToOne: true; referencedRelation: 'form_submissions'; referencedColumns: ['id'] },
        { foreignKeyName: 'projects_archived_by_fkey'; columns: ['archived_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'projects_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
      ]>
      project_members: TableDefinition<ProjectMemberRow, {
        project_id: string; user_id: string; assigned_by?: string | null; assigned_at?: string
      }, Partial<ProjectMemberRow>, [
        { foreignKeyName: 'project_members_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'project_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      tasks: TableDefinition<TaskRow, {
        id?: string; title: string; description?: string | null; project_id: string; status?: TaskStatus; priority?: TaskPriority; assignee_id?: string | null; due_date?: string | null; completed_date?: string | null; tags?: string[]; comments_count?: number; attachments_count?: number; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<TaskRow>, [
        { foreignKeyName: 'tasks_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'tasks_assignee_id_fkey'; columns: ['assignee_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      task_activity: TableDefinition<TaskActivityRow, {
        id?: string; task_id: string; project_id: string; actor_id?: string | null; event_type: TaskActivityEventType; old_value?: string | null; new_value?: string | null; metadata?: Json; created_at?: string
      }, Partial<TaskActivityRow>, [
        { foreignKeyName: 'task_activity_task_id_fkey'; columns: ['task_id']; isOneToOne: false; referencedRelation: 'tasks'; referencedColumns: ['id'] },
        { foreignKeyName: 'task_activity_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'task_activity_actor_id_fkey'; columns: ['actor_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      project_activity: TableDefinition<ProjectActivityRow, {
        id?: string; project_id: string; actor_id?: string | null; event_type: ProjectActivityEventType; old_value?: string | null; new_value?: string | null; metadata?: Json; created_at?: string
      }, Partial<ProjectActivityRow>, [
        { foreignKeyName: 'project_activity_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'project_activity_actor_id_fkey'; columns: ['actor_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      project_deliveries: TableDefinition<ProjectDeliveryRow, {
        id?: string; project_id: string; version: number; status?: ProjectDeliveryStatus; notes?: string | null; delivered_at?: string | null; delivered_by?: string | null; approval_state?: ProjectDeliveryApprovalState; approval_recorded_by?: string | null; approval_recorded_at?: string | null; approval_note?: string | null; revision_note?: string | null; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<ProjectDeliveryRow>, [
        { foreignKeyName: 'project_deliveries_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'project_deliveries_delivered_by_fkey'; columns: ['delivered_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'project_deliveries_approval_recorded_by_fkey'; columns: ['approval_recorded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      project_delivery_files: TableDefinition<ProjectDeliveryFileRow, {
        delivery_id: string; file_id: string; added_by?: string | null; added_at?: string
      }, Partial<ProjectDeliveryFileRow>, [
        { foreignKeyName: 'project_delivery_files_delivery_id_fkey'; columns: ['delivery_id']; isOneToOne: false; referencedRelation: 'project_deliveries'; referencedColumns: ['id'] },
        { foreignKeyName: 'project_delivery_files_file_id_fkey'; columns: ['file_id']; isOneToOne: false; referencedRelation: 'files'; referencedColumns: ['id'] },
      ]>
      files: TableDefinition<FileRow, {
        id?: string; name: string; type?: FileRow['type']; size?: number; mime_type?: string | null; storage_path?: string | null; project_id?: string | null; client_id?: string | null; uploaded_by?: string | null; starred?: boolean; created_at?: string; updated_at?: string
      }, Partial<FileRow>, [
        { foreignKeyName: 'files_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'files_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] },
      ]>
      interactions: TableDefinition<InteractionRow, {
        id?: string; type?: InteractionRow['type']; title: string; description?: string | null; client_id: string; project_id?: string | null; date?: string; created_by?: string | null; created_at?: string
      }, Partial<InteractionRow>, [{ foreignKeyName: 'interactions_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }]>
      comments: TableDefinition<CommentRow, {
        id?: string; content: string; entity_type: CommentRow['entity_type']; entity_id: string; author_id?: string | null; created_at?: string; updated_at?: string
      }, Partial<CommentRow>, [{ foreignKeyName: 'comments_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }]>
      form_templates: TableDefinition<FormTemplateRow, {
        id?: string; slug: string; title: string; description?: string | null; status?: FormStatus; version?: number; settings?: Json; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<FormTemplateRow>>
      form_questions: TableDefinition<FormQuestionRow, {
        id?: string; form_id: string; question_type: FormQuestionType; label: string; help_text?: string | null; placeholder?: string | null; required?: boolean; options?: Json; config?: Json; map_to?: FormQuestionMapTo | null; position?: number; created_at?: string; updated_at?: string
      }, Partial<FormQuestionRow>>
      form_submissions: TableDefinition<FormSubmissionRow, {
        id?: string; form_id: string; form_version?: number; status?: FormSubmissionRow['status']; respondent_name?: string | null; respondent_email?: string | null; respondent_phone?: string | null; company_name?: string | null; client_id?: string | null; project_id?: string | null; reviewer_id?: string | null; reviewed_at?: string | null; converted_at?: string | null; converted_by?: string | null; created_by?: string | null; submitted_at?: string; created_at?: string; updated_at?: string
      }, Partial<FormSubmissionRow>>
      form_submission_answers: TableDefinition<FormSubmissionAnswerRow, {
        id?: string; submission_id: string; question_id?: string | null; question_snapshot: Json; value?: Json; created_at?: string
      }, Partial<FormSubmissionAnswerRow>>
      form_submission_attachments: TableDefinition<FormSubmissionAttachmentRow, {
        id?: string; submission_id: string; question_id?: string | null; name: string; size?: number; mime_type?: string | null; storage_path: string; uploaded_by?: string | null; created_at?: string
      }, Partial<FormSubmissionAttachmentRow>>
      form_submission_notes: TableDefinition<FormSubmissionNoteRow, {
        id?: string; submission_id: string; author_id: string; note: string; created_at?: string; updated_at?: string
      }, Partial<FormSubmissionNoteRow>, [
        { foreignKeyName: 'form_submission_notes_submission_id_fkey'; columns: ['submission_id']; isOneToOne: false; referencedRelation: 'form_submissions'; referencedColumns: ['id'] },
        { foreignKeyName: 'form_submission_notes_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      form_submission_events: TableDefinition<FormSubmissionEventRow, {
        id?: string; submission_id: string; actor_id?: string | null; event_type: FormSubmissionEventType; old_value?: string | null; new_value?: string | null; note?: string | null; metadata?: Json; created_at?: string
      }, Partial<FormSubmissionEventRow>, [
        { foreignKeyName: 'form_submission_events_submission_id_fkey'; columns: ['submission_id']; isOneToOne: false; referencedRelation: 'form_submissions'; referencedColumns: ['id'] },
        { foreignKeyName: 'form_submission_events_actor_id_fkey'; columns: ['actor_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      notifications: TableDefinition<NotificationRow, {
        id?: string; recipient_id: string; actor_id?: string | null; project_id?: string | null; submission_id?: string | null; task_id?: string | null; type?: NotificationType; title: string; message: string; action_url?: string | null; metadata?: NotificationMetadata | Json; read_at?: string | null; created_at?: string
      }, Partial<NotificationRow>, [
        { foreignKeyName: 'notifications_recipient_id_fkey'; columns: ['recipient_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'notifications_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'notifications_submission_id_fkey'; columns: ['submission_id']; isOneToOne: false; referencedRelation: 'form_submissions'; referencedColumns: ['id'] },
        { foreignKeyName: 'notifications_task_id_fkey'; columns: ['task_id']; isOneToOne: false; referencedRelation: 'tasks'; referencedColumns: ['id'] },
      ]>
      portfolio_categories: TableDefinition<PortfolioCategoryRow, {
        id?: string; name: string; slug: string; is_active?: boolean; display_order?: number; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<PortfolioCategoryRow>, [
        { foreignKeyName: 'portfolio_categories_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      portfolio_projects: TableDefinition<PortfolioProjectRow, {
        id?: string; title: string; slug: string; cover_image_path?: string | null; description?: string | null; client_name?: string | null; category_id?: string | null; services?: string[]; project_date?: string | null; external_url?: string | null; featured?: boolean; published?: boolean; archived?: boolean; display_order?: number; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<PortfolioProjectRow>, [
        { foreignKeyName: 'portfolio_projects_category_id_fkey'; columns: ['category_id']; isOneToOne: false; referencedRelation: 'portfolio_categories'; referencedColumns: ['id'] },
        { foreignKeyName: 'portfolio_projects_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      portfolio_project_images: TableDefinition<PortfolioProjectImageRow, {
        id?: string; project_id: string; storage_path: string; alt_text?: string | null; display_order?: number; uploaded_by?: string | null; created_at?: string
      }, Partial<PortfolioProjectImageRow>, [
        { foreignKeyName: 'portfolio_project_images_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'portfolio_projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'portfolio_project_images_uploaded_by_fkey'; columns: ['uploaded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
    }
    Views: { [_ in never]: never }
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: AppRole }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_manager_or_admin: { Args: Record<string, never>; Returns: boolean }
      can_access_project: { Args: { target_project_id: string }; Returns: boolean }
      can_access_client: { Args: { target_client_id: string }; Returns: boolean }
      set_user_role: { Args: { target_user_id: string; new_role: AppRole }; Returns: ProfileRow }
      set_user_status: { Args: { target_user_id: string; new_status: ProfileStatus }; Returns: ProfileRow }
      set_user_employee_role: { Args: { target_user_id: string; new_employee_role_id: string | null }; Returns: ProfileRow }
      set_user_client_link: { Args: { target_user_id: string; new_client_id: string | null }; Returns: ProfileRow }
      update_own_profile: { Args: { new_full_name: string; new_avatar_url: string; new_agency_name: string; new_agency_website: string; new_phone: string; new_bio: string }; Returns: ProfileRow }
      update_own_enhanced_profile: { Args: { p_user_id: string; p_full_name: string | null; p_phone: string | null; p_whatsapp: string | null; p_bio: string | null; p_job_title: string | null; p_skills: string | null; p_experience: string | null; p_previous_projects: string | null; p_certifications: string | null; p_location: string | null; p_portfolio_url: string | null; p_linkedin: string | null; p_behance: string | null; p_instagram: string | null; p_facebook: string | null; p_twitter: string | null; p_personal_website: string | null; p_other_social_links: Json | null; p_avatar_url: string | null }; Returns: ProfileRow }
      mark_password_changed: { Args: { p_user_id: string }; Returns: undefined }
      admin_create_team_member: { Args: { p_email: string; p_full_name: string; p_phone?: string | null; p_whatsapp?: string | null; p_avatar_url?: string | null; p_job_title?: string | null; p_department?: string | null; p_specialization?: string | null; p_bio?: string | null; p_location?: string | null; p_portfolio_url?: string | null; p_social_links?: Json; p_role_id?: string | null; p_employee_role_id?: string | null; p_status?: string }; Returns: ProfileRow }
      admin_update_team_member: { Args: { p_user_id: string; p_email?: string | null; p_full_name?: string | null; p_phone?: string | null; p_whatsapp?: string | null; p_avatar_url?: string | null; p_job_title?: string | null; p_department?: string | null; p_specialization?: string | null; p_bio?: string | null; p_location?: string | null; p_portfolio_url?: string | null; p_social_links?: Json; p_role_id?: string | null; p_employee_role_id?: string | null; p_status?: string | null }; Returns: ProfileRow }
      admin_delete_team_member: { Args: { p_user_id: string }; Returns: boolean }
      submit_dynamic_form: { Args: { p_form_id: string; p_answers: Json }; Returns: FormSubmissionRow }
      convert_submission_to_project: { Args: { p_submission_id: string; p_client_id: string | null; p_new_client: Json | null; p_project_name: string; p_description: string | null; p_project_type: string; p_priority: ProjectPriority; p_status: ProjectStatus; p_phase: number; p_phase_name: string | null; p_start_date: string | null; p_due_date: string | null; p_budget: number | null; p_currency: string; p_owner_id: string; p_manager_id: string | null; p_team_member_ids: string[] }; Returns: ProjectRow }
      update_form_submission_status: { Args: { p_submission_id: string; p_status: string; p_note?: string | null }; Returns: boolean }
      assign_form_submission_reviewer: { Args: { p_submission_id: string; p_reviewer_id: string | null; p_note?: string | null }; Returns: boolean }
      add_form_submission_note: { Args: { p_submission_id: string; p_note: string }; Returns: FormSubmissionNoteRow }
      delete_form_submission_note: { Args: { p_note_id: string }; Returns: boolean }
      duplicate_form_template: { Args: { p_form_id: string }; Returns: FormTemplateRow }
      reorder_form_questions: { Args: { p_form_id: string; p_question_ids: string[] }; Returns: number }
      get_user_permissions: { Args: Record<string, never>; Returns: string[] }
      has_permission: { Args: { required_permission: string }; Returns: boolean }
      list_permissions: { Args: Record<string, never>; Returns: PermissionRow[] }
      list_roles: { Args: Record<string, never>; Returns: AppRoleWithPermissions[] }
      create_app_role: { Args: { p_name: string; p_description: string }; Returns: AppRoleRow }
      update_app_role: { Args: { p_role_id: string; p_name: string; p_description: string; p_is_active: boolean }; Returns: AppRoleRow }
      delete_app_role: { Args: { p_role_id: string }; Returns: boolean }
      set_role_permissions: { Args: { p_role_id: string; p_permission_keys: string[] }; Returns: AppRoleRow }
      assign_user_role: { Args: { p_user_id: string; p_role_id: string }; Returns: ProfileRow }
      add_permission: { Args: { p_key: string; p_name: string; p_category: string; p_description: string }; Returns: PermissionRow }
      get_public_portfolio_projects: { Args: Record<string, never>; Returns: PortfolioPublicRpcRow[] }
      get_public_portfolio_project: { Args: { p_slug: string }; Returns: PortfolioPublicRpcRow[] }
      get_storage_audit_summary: { Args: Record<string, never>; Returns: Json }
      user_has_permission: { Args: { p_user_id: string; p_permission: string }; Returns: boolean }
      can_user_access_project: { Args: { p_user_id: string; p_project_id: string }; Returns: boolean }
      add_task_note: { Args: { p_task_id: string; p_note: string }; Returns: TaskActivityRow }
      list_task_assignees: { Args: { p_project_id: string }; Returns: TaskAssigneeRow[] }
      prepare_project_delivery: { Args: { p_project_id: string; p_notes?: string | null }; Returns: ProjectDeliveryRow }
      add_project_delivery_file: { Args: { p_project_id: string; p_file_id: string }; Returns: ProjectDeliveryRow }
      remove_project_delivery_file: { Args: { p_project_id: string; p_file_id: string }; Returns: boolean }
      mark_delivery_ready: { Args: { p_project_id: string }; Returns: ProjectRow }
      mark_project_delivered: { Args: { p_project_id: string; p_note?: string | null }; Returns: ProjectRow }
      request_project_revision: { Args: { p_project_id: string; p_note: string }; Returns: ProjectDeliveryRow }
      record_internal_client_approval: { Args: { p_project_id: string; p_note: string; p_state?: ProjectDeliveryApprovalState }; Returns: ProjectDeliveryRow }
      complete_project: { Args: { p_project_id: string }; Returns: ProjectRow }
      archive_project: { Args: { p_project_id: string }; Returns: ProjectRow }
      unarchive_project: { Args: { p_project_id: string }; Returns: ProjectRow }
      project_completion_blockers: { Args: { p_project_id: string }; Returns: string[] }
    }
    Enums: { app_role: AppRole }
    CompositeTypes: { [_ in never]: never }
  }
}

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
export type FileWithProject = FileItem & {
  projects: Pick<Project, 'id' | 'name'> | null
  is_delivery?: boolean
}
