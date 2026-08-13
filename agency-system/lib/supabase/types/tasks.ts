/**
 * tasks — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
import type { AppRole, Json, TaskPriority, TaskStatus } from './core'
import type { Project } from './projects'
import type { Profile } from './team'
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


/** One row of the list_task_assignees RPC: a valid task assignee candidate. */

export type TaskAssigneeRow = {
  id: string
  full_name: string | null
  email: string
  job_title: string | null
  role: AppRole
  is_member: boolean
}


export type Task = TaskRow

export type TaskInsert = Database['public']['Tables']['tasks']['Insert']

export type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export type TaskWithRelations = Task & {
  projects: Pick<Project, 'id' | 'name'> | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export type TaskActivity = TaskActivityRow & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}

export type TaskAssignee = TaskAssigneeRow
