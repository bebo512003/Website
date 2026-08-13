/**
 * projects — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
import type { Json, ProjectHealth, ProjectPriority, ProjectStatus } from './core'
import type { Client } from './clients'
import type { Profile } from './team'
import type { FileItem } from './files'
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


export type CommentRow = {
  id: string
  content: string
  entity_type: 'project' | 'task' | 'client' | 'file'
  entity_id: string
  author_id: string | null
  created_at: string
  updated_at: string
}


export type Project = ProjectRow

export type ProjectInsert = Database['public']['Tables']['projects']['Insert']

export type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export type ProjectMember = ProjectMemberRow

export type Comment = CommentRow

export type CommentInsert = Database['public']['Tables']['comments']['Insert']

export type CommentWithAuthor = Comment & {
  author?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null
}

export type ProjectWithClient = Project & {
  clients: Pick<Client, 'id' | 'name'> | null
  owner?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  manager?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

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

