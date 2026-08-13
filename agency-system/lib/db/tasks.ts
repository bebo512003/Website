/**
 * tasks repository — data access for the tasks domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, PageQuery, PageResult, pagedFail, escapeFilterValue, executePage } from './shared'
import type { Task, TaskActivity, TaskAssignee, TaskInsert, TaskPriority, TaskStatus, TaskUpdate, TaskWithRelations } from '../supabase/types'
const taskWithRelationsSelect = '*, projects(id, name), profiles!tasks_assignee_id_fkey(id, full_name, email)'


export async function getTasks(): Promise<Result<TaskWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('tasks').select(taskWithRelationsSelect).order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskWithRelations[])
}


export type TaskListFilter = {
  search?: string
  projectId?: string
  priority?: 'all' | TaskPriority
  /** 'mine' resolves to the signed-in user; 'unassigned' matches null
   * assignees; anything else is treated as an exact assignee id. */
  assignee?: 'all' | 'mine' | 'unassigned' | string
  status?: 'all' | TaskStatus
}


/** Server-side search/filter/pagination for the tasks board. Each board column
 * requests its own page (`status` filter) plus the exact total for that column
 * so "show more" can page through large boards without loading everything. */

export async function getTasksPage(
  filter: TaskListFilter & PageQuery = {}
): Promise<PageResult<TaskWithRelations>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 20)
  const { page = 1, pageSize = 20 } = filter
  let query = supabase.from('tasks').select(taskWithRelationsSelect, { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) query = query.or(`title.ilike.*${q}*,description.ilike.*${q}*`)
  if (filter.projectId && filter.projectId !== 'all') query = query.eq('project_id', filter.projectId)
  if (filter.priority && filter.priority !== 'all') query = query.eq('priority', filter.priority)
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)

  if (filter.assignee === 'mine') {
    const { data: session } = await supabase.auth.getSession()
    if (session.session?.user?.id) query = query.eq('assignee_id', session.session.user.id)
  } else if (filter.assignee === 'unassigned') {
    query = query.is('assignee_id', null)
  } else if (filter.assignee && filter.assignee !== 'all') {
    query = query.eq('assignee_id', filter.assignee)
  }

  query = query.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
  return executePage<TaskWithRelations>(query, page, pageSize)
}


export async function getTasksByProjectId(projectId: string): Promise<Result<TaskWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('tasks').select(taskWithRelationsSelect).eq('project_id', projectId).order('created_at')
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskWithRelations[])
}


/**
 * The personal "My Work" list: every task assigned to the given user inside
 * projects their account may access (RLS applies on top). Nearest due dates
 * first, undated work after that.
 */

export async function getMyTasks(userId: string): Promise<Result<TaskWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('tasks')
    .select(taskWithRelationsSelect)
    .eq('assignee_id', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskWithRelations[])
}


export async function getTaskById(id: string): Promise<Result<TaskWithRelations | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('tasks').select(taskWithRelationsSelect).eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok((data || null) as unknown as TaskWithRelations | null)
}


/** Everyone the database will accept as assignee for one project (members first). */

export async function getTaskAssignees(projectId: string): Promise<Result<TaskAssignee[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('list_task_assignees', { p_project_id: projectId })
  return error ? fail([], error.message) : ok((data as unknown as TaskAssignee[]) || [])
}


export const taskActivitySelect = '*, actor:profiles!task_activity_actor_id_fkey(id, full_name, email, avatar_url, job_title)'


export async function getTaskActivity(taskId: string): Promise<Result<TaskActivity[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('task_activity')
    .select(taskActivitySelect)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskActivity[])
}


export async function addTaskNote(taskId: string, note: string): Promise<Result<TaskActivity | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_task_note', { p_task_id: taskId, p_note: note })
  return error ? fail(null, error.message) : ok(data as unknown as TaskActivity | null)
}


export async function createTask(task: TaskInsert): Promise<Result<Task | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('tasks').insert(task).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as Task | null)
}


export async function updateTask(id: string, updates: TaskUpdate): Promise<Result<Task | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as Task | null)
}


export async function deleteTask(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

