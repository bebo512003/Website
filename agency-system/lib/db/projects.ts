/**
 * projects repository — data access for the projects domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, PageQuery, PageResult, pagedFail, escapeFilterValue, executePage } from './shared'
import { taskActivitySelect } from './tasks'
import type { Comment, CommentWithAuthor, Profile, Project, ProjectActivity, ProjectDelivery, ProjectDeliveryApprovalState, ProjectDeliveryFile, ProjectDeliveryWithFiles, ProjectInsert, ProjectMember, ProjectStatus, ProjectUpdate, ProjectWithClient, TaskActivity } from '../supabase/types'


export async function addProjectComment(projectId: string, content: string): Promise<Result<Comment | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase
    .from('comments')
    .insert({ content, entity_type: 'project', entity_id: projectId })
    .select()
    .single()
  return error ? fail(null, error.message) : ok(data as unknown as Comment | null)
}


const projectWithClientSelect = '*, clients(id, name), owner:profiles!projects_owner_id_fkey(id, full_name, email), manager:profiles!projects_manager_id_fkey(id, full_name, email)'


export async function getProjects(): Promise<Result<ProjectWithClient[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('projects').select(projectWithClientSelect).order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as ProjectWithClient[])
}


export type ProjectListFilter = {
  search?: string
  status?: 'all' | 'delivery' | ProjectStatus
  showArchived?: boolean
  sort?: 'newest' | 'oldest' | 'name' | 'deadline'
}


/** Server-side search (project name/type/description + linked client name),
 * status/archive filters, sort, and pagination for the project portfolio. */

export async function getProjectsPage(
  filter: ProjectListFilter & PageQuery = {}
): Promise<PageResult<ProjectWithClient>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 12)
  const { page = 1, pageSize = 12, sort = 'newest' } = filter
  let query = supabase.from('projects').select(projectWithClientSelect, { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) {
    // Clients are matched by id (resolved in a tiny name-only query) so search
    // can OR across project fields and the linked client name in one query.
    const clientIds = await supabase
      .from('clients')
      .select('id')
      .ilike('name', `*${q}*`)
      .limit(200)
    const ids = (clientIds.data || []).map((row) => (row as { id: string }).id)
    const parts = [
      `name.ilike.*${q}*`,
      `type.ilike.*${q}*`,
      `description.ilike.*${q}*`,
    ]
    if (ids.length) parts.push(`client_id.in.(${ids.join(',')})`)
    query = query.or(parts.join(','))
  }

  if (filter.status === 'delivery') {
    query = query.in('status', ['ready-for-delivery', 'delivered'])
  } else if (filter.status && filter.status !== 'all') {
    query = query.eq('status', filter.status)
  }
  if (filter.showArchived) query = query.not('archived_at', 'is', null)
  else query = query.is('archived_at', null)

  if (sort === 'oldest') query = query.order('created_at', { ascending: true })
  else if (sort === 'name') query = query.order('name')
  else if (sort === 'deadline') query = query.order('due_date', { ascending: true, nullsFirst: false })
  else query = query.order('created_at', { ascending: false })

  return executePage<ProjectWithClient>(query, page, pageSize)
}


export type ProjectListCounts = {
  all: number
  active: number
  review: number
  delivery: number
  completed: number
  archived: number
}


/** Summary card counts for the projects page — computed in the database, never
 * by loading the full portfolio into the browser. */

export async function getProjectListCounts(): Promise<Result<ProjectListCounts>> {
  if (!supabase) return fail({ all: 0, active: 0, review: 0, delivery: 0, completed: 0, archived: 0 })
  const client = supabase
  const countLive = () => client.from('projects').select('id', { count: 'exact', head: true }).is('archived_at', null)
  const countAll = () => client.from('projects').select('id', { count: 'exact', head: true })
  const countStatus = (status: ProjectStatus) => client.from('projects').select('id', { count: 'exact', head: true }).is('archived_at', null).eq('status', status)
  const [all, active, review, delivery, completed, archived] = await Promise.all([
    countLive(),
    countStatus('active'),
    countStatus('in-review'),
    client.from('projects').select('id', { count: 'exact', head: true }).is('archived_at', null).in('status', ['ready-for-delivery', 'delivered']),
    countStatus('completed'),
    countAll().not('archived_at', 'is', null),
  ])
  const counts: ProjectListCounts = {
    all: all.count || 0,
    active: active.count || 0,
    review: review.count || 0,
    delivery: delivery.count || 0,
    completed: completed.count || 0,
    archived: archived.count || 0,
  }
  const firstError = [all, active, review, delivery, completed, archived].find((r) => r.error)?.error
  return firstError ? fail(counts, firstError.message) : ok(counts)
}

export async function getProjectById(id: string): Promise<Result<ProjectWithClient | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').select(projectWithClientSelect).eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok(data as unknown as ProjectWithClient | null)
}

export async function getProjectsByClientId(clientId: string): Promise<Result<Project[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as Project[])
}

export async function createProject(project: ProjectInsert): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').insert(project).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as Project | null)
}

/**
 * Creates a project and assigns its initial team in one go. The owner and
 * manager are added to `project_members` automatically by a database trigger
 * (`sync_project_lead_membership`), so only the additional team members are
 * inserted here — avoiding duplicate-key conflicts.
 */

export async function createProjectWithTeam(
  project: ProjectInsert,
  teamMemberIds: string[] = []
): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').insert(project).select().single()
  if (error) return fail(null, error.message)
  if (!data) return fail(null, 'The project was not created.')

  const leads = new Set([project.owner_id, project.manager_id].filter(Boolean))
  const extras = teamMemberIds.filter((id) => Boolean(id) && !leads.has(id))
  if (extras.length > 0) {
    const { error: memberError } = await supabase
      .from('project_members')
      .insert(extras.map((userId) => ({ project_id: data.id, user_id: userId })))
    if (memberError) return fail(data as unknown as Project | null, memberError.message)
  }
  return ok(data as unknown as Project | null)
}

export async function updateProject(id: string, updates: ProjectUpdate): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as Project | null)
}

export async function deleteProject(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  // Clean up any files in project-files bucket for this project before deleting row
  const filesQuery = await supabase.from('files').select('storage_path').eq('project_id', id)
  if (filesQuery.data && filesQuery.data.length > 0) {
    const paths = filesQuery.data.map((f) => f.storage_path).filter((p): p is string => Boolean(p))
    if (paths.length > 0) {
      await supabase.storage.from('project-files').remove(paths)
    }
  }
  const { error } = await supabase.from('projects').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function getProjectMembers(projectId: string): Promise<Result<(ProjectMember & { profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null })[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('project_members').select('*, profiles!project_members_user_id_fkey(id, full_name, email, role)').eq('project_id', projectId)
  return error ? fail([], error.message) : ok((data || []) as unknown as (ProjectMember & { profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null })[])
}


export async function addProjectMember(projectId: string, userId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: userId })
  return error ? fail(false, error.message) : ok(true)
}


export async function removeProjectMember(projectId: string, userId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
  return error ? fail(false, error.message) : ok(true)
}


const projectActivitySelect = '*, actor:profiles!project_activity_actor_id_fkey(id, full_name, email, avatar_url, job_title)'


/** Project-level audit events for one project (creation, status, ownership,
 * membership, files). Task events are fetched separately and merged in the
 * unified timeline (see lib/project-activity.ts). */

export async function getProjectActivity(projectId: string): Promise<Result<ProjectActivity[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('project_activity')
    .select(projectActivitySelect)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  return error ? fail([], error.message) : ok((data || []) as unknown as ProjectActivity[])
}


export async function getProjectDeliveries(projectId: string): Promise<Result<ProjectDeliveryWithFiles[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('project_deliveries')
    .select('*, project_delivery_files(*, file:files(*))')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
  if (error) return fail([], error.message)
  const deliveries = ((data || []) as unknown as (ProjectDelivery & { project_delivery_files?: ProjectDeliveryFile[] })[]).map((row) => ({
    ...row,
    files: row.project_delivery_files || [],
  }))
  return ok(deliveries)
}


export async function prepareProjectDelivery(projectId: string, notes?: string | null): Promise<Result<ProjectDelivery | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('prepare_project_delivery', { p_project_id: projectId, p_notes: notes || null })
  return error ? fail(null, error.message) : ok(data as unknown as ProjectDelivery)
}


export async function addProjectDeliveryFile(projectId: string, fileId: string): Promise<Result<ProjectDelivery | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_project_delivery_file', { p_project_id: projectId, p_file_id: fileId })
  return error ? fail(null, error.message) : ok(data as unknown as ProjectDelivery)
}


export async function removeProjectDeliveryFile(projectId: string, fileId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('remove_project_delivery_file', { p_project_id: projectId, p_file_id: fileId })
  return error ? fail(false, error.message) : ok(true)
}


export async function markDeliveryReady(projectId: string): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('mark_delivery_ready', { p_project_id: projectId })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}


export async function markProjectDelivered(projectId: string, note?: string | null): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('mark_project_delivered', { p_project_id: projectId, p_note: note || null })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}


export async function requestProjectRevision(projectId: string, note: string): Promise<Result<ProjectDelivery | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('request_project_revision', { p_project_id: projectId, p_note: note })
  return error ? fail(null, error.message) : ok(data as unknown as ProjectDelivery)
}


export async function recordInternalClientApproval(
  projectId: string,
  note: string,
  state: ProjectDeliveryApprovalState = 'approved_internally',
): Promise<Result<ProjectDelivery | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('record_internal_client_approval', {
    p_project_id: projectId,
    p_note: note,
    p_state: state,
  })
  return error ? fail(null, error.message) : ok(data as unknown as ProjectDelivery)
}


export async function completeProject(projectId: string): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('complete_project', { p_project_id: projectId })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}


export async function archiveProject(projectId: string): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('archive_project', { p_project_id: projectId })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}


export async function unarchiveProject(projectId: string): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('unarchive_project', { p_project_id: projectId })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}




/** Every task-level event recorded across the tasks of one project. */

export async function getProjectTaskActivity(projectId: string): Promise<Result<TaskActivity[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('task_activity')
    .select(taskActivitySelect)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskActivity[])
}

