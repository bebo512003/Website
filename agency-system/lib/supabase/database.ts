import { isDatabaseConnected, supabase } from './client'
import { validateFile, sanitizeFileName, STORAGE_RULES } from '@/lib/storage-config'
import type {
  AccessRole,
  AppRole,
  AppRoleWithPermissions,
  Client,
  ClientApproval,
  ClientInsert,
  ClientMessage,
  ClientMessageWithAuthor,
  ClientPortalClient,
  ClientPortalCollaboration,
  ClientPortalProject,
  ClientSharedFile,
  ClientSharedFileWithFile,
  ClientUpdate,
  Comment,
  CommentWithAuthor,
  EmployeeRole,
  EmployeeRoleInsert,
  EmployeeRoleUpdate,
  FileItem,
  ClientFormSubmission,
  FileWithProject,
  Notification,
  OperationalAnalytics,
  Permission,
  PortfolioCategory,
  PortfolioCategoryInsert,
  PortfolioCategoryUpdate,
  PortfolioProject,
  PortfolioProjectImage,
  PortfolioProjectInsert,
  PortfolioPublicRpcRow,
  PortfolioProjectUpdate,
  PortfolioProjectWithRelations,
  Profile,
  ProfileStatus,
  Project,
  ProjectInsert,
  ProjectActivity,
  ProjectDelivery,
  ProjectDeliveryApprovalState,
  ProjectDeliveryFile,
  ProjectDeliveryWithFiles,
  ProjectMember,
  ProjectPriority,
  ProjectStatus,
  ProjectUpdate,
  ProjectWithClient,
  SubmissionStatus,
  Task,
  TaskActivity,
  TaskAssignee,
  TaskInsert,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
  TaskWithRelations,
} from './types'
export interface Result<T> {
  data: T
  error: string | null
}

const notConfigured = 'Supabase is not configured.'
const fail = <T>(data: T, message = notConfigured): Result<T> => ({ data, error: message })
const ok = <T>(data: T): Result<T> => ({ data, error: null })

// ── Server-side pagination (Session 23) ─────────────────────────────────────
// Large collections are filtered, sorted, and paged in the database — the
// browser only ever receives one page of rows plus the exact total count.

export type PageQuery = {
  /** 1-based page number. */
  page?: number
  /** Rows per page (clamped to 1..100 server-side). */
  pageSize?: number
}

export type PageResult<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
  error: string | null
}

export const pagedFail = <T>(page: number, pageSize: number, message = notConfigured): PageResult<T> => ({
  data: [],
  total: 0,
  page,
  pageSize,
  error: message,
})

/** Sanitizes a user search term for PostgREST `.or()` filter syntax: the
 * wildcard and list-delimiter characters are stripped so the term is treated
 * as a literal substring everywhere it is interpolated. */
export function escapeFilterValue(value: string): string {
  return value.replace(/[*%,()]/g, '').trim()
}

/** A Supabase query builder that has been started with
 * `.select(cols, { count: 'exact' })` — structurally typed so we do not depend
 * on the versioned PostgREST builder generics. */
type CountableRangeQuery = {
  range: (from: number, to: number) => PromiseLike<{
    data: unknown
    count: number | null
    error: { message: string } | null
  }>
}

/** Applies count + range to an already-built Supabase query and normalizes the
 * result into a PageResult. */
export async function executePage<T>(
  query: CountableRangeQuery,
  page: number,
  pageSize: number
): Promise<PageResult<T>> {
  if (!supabase) return pagedFail(page, pageSize)
  const safePage = Math.max(1, Math.floor(page) || 1)
  const safeSize = Math.min(Math.max(1, Math.floor(pageSize) || 25), 100)
  const from = (safePage - 1) * safeSize
  const { data, count, error } = await query.range(from, from + safeSize - 1)
  if (error) return { data: [], total: 0, page: safePage, pageSize: safeSize, error: error.message }
  return {
    data: (data || []) as unknown as T[],
    total: count ?? 0,
    page: safePage,
    pageSize: safeSize,
    error: null,
  }
}

export function getDatabaseStatus() {
  return { connected: isDatabaseConnected }
}

/** One database-aggregated operational report. The RPC applies report.view,
 * account-state, submission, and project-access checks before returning data. */
export async function getOperationalAnalytics(days = 30): Promise<Result<OperationalAnalytics | null>> {
  if (!supabase) return fail(null)
  const safeDays = Math.min(365, Math.max(7, Math.floor(days) || 30))
  const { data, error } = await supabase.rpc('get_operational_analytics', { p_days: safeDays })
  return error ? fail(null, error.message) : ok(data as unknown as OperationalAnalytics)
}

export async function getProfiles(): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  return error ? fail([], error.message) : ok(data || [])
}
export async function setProfileRole(userId: string, role: AppRole): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_user_role', { target_user_id: userId, new_role: role })
  return error ? fail(null, error.message) : ok(data)
}
export async function setProfileStatus(userId: string, status: ProfileStatus): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_user_status', { target_user_id: userId, new_status: status })
  return error ? fail(null, error.message) : ok(data)
}
export async function setProfileEmployeeRole(userId: string, employeeRoleId: string | null): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_user_employee_role', { target_user_id: userId, new_employee_role_id: employeeRoleId })
  return error ? fail(null, error.message) : ok(data)
}
export async function setProfileClientLink(userId: string, clientId: string | null): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_user_client_link', { target_user_id: userId, new_client_id: clientId })
  return error ? fail(null, error.message) : ok(data)
}
export async function getEmployeeRoles(): Promise<Result<EmployeeRole[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('employee_roles').select('*').order('name')
  return error ? fail([], error.message) : ok(data || [])
}
export async function createEmployeeRole(role: EmployeeRoleInsert): Promise<Result<EmployeeRole | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('employee_roles').insert(role).select().single()
  return error ? fail(null, error.message) : ok(data)
}
export async function updateEmployeeRole(id: string, updates: EmployeeRoleUpdate): Promise<Result<EmployeeRole | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('employee_roles').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}
export async function deleteEmployeeRole(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('employee_roles').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

// Role / permission system
export async function getCurrentUserPermissions(): Promise<Result<string[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('get_user_permissions')
  return error ? fail([], error.message) : ok(data || [])
}
export async function getPermissions(): Promise<Result<Permission[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('list_permissions')
  return error ? fail([], error.message) : ok((data as unknown as Permission[]) || [])
}
export async function getAppRoles(): Promise<Result<AppRoleWithPermissions[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('list_roles')
  return error ? fail([], error.message) : ok((data as unknown as AppRoleWithPermissions[]) || [])
}
export async function createAppRole(name: string, description: string): Promise<Result<AccessRole | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('create_app_role', { p_name: name, p_description: description })
  return error ? fail(null, error.message) : ok(data as unknown as AccessRole)
}
export async function updateAppRole(id: string, name: string, description: string, isActive: boolean): Promise<Result<AccessRole | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('update_app_role', { p_role_id: id, p_name: name, p_description: description, p_is_active: isActive })
  return error ? fail(null, error.message) : ok(data as unknown as AccessRole)
}
export async function deleteAppRole(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { data, error } = await supabase.rpc('delete_app_role', { p_role_id: id })
  return error ? fail(false, error.message) : ok(data as boolean)
}
export async function setRolePermissions(roleId: string, permissionKeys: string[]): Promise<Result<AccessRole | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_role_permissions', { p_role_id: roleId, p_permission_keys: permissionKeys })
  return error ? fail(null, error.message) : ok(data as unknown as AccessRole)
}
export async function assignUserRole(userId: string, roleId: string): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('assign_user_role', { p_user_id: userId, p_role_id: roleId })
  return error ? fail(null, error.message) : ok(data as unknown as Profile)
}
export async function addPermission(key: string, name: string, category: string, description: string): Promise<Result<Permission | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_permission', { p_key: key, p_name: name, p_category: category, p_description: description })
  return error ? fail(null, error.message) : ok(data as unknown as Permission)
}

// Client portal — Dynamic Form submissions linked to the signed-in client record
export async function getClientFormSubmissions(): Promise<Result<ClientFormSubmission[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, form_templates(title, slug)')
    .order('submitted_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientFormSubmission[])
}

// Client portal — projects owned by the signed-in client record. These go
// through sanitized SECURITY DEFINER RPCs so the browser client never reads the
// raw `projects` table (no owner/manager/team/budget/health/internal fields).
export async function getClientPortalProjects(): Promise<Result<ClientPortalProject[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('get_client_portal_projects')
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientPortalProject[])
}

export async function getClientPortalProject(id: string): Promise<Result<ClientPortalProject | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_client_portal_project', { p_project_id: id })
  if (error) return fail(null, error.message)
  const row = (data || [])[0] as ClientPortalProject | undefined
  return ok(row || null)
}

export async function getClientPortalClient(): Promise<Result<ClientPortalClient | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_client_portal_client')
  if (error) return fail(null, error.message)
  const row = (data || [])[0] as ClientPortalClient | undefined
  return ok(row || null)
}

export async function getClientPortalCollaboration(projectId: string): Promise<Result<ClientPortalCollaboration | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_client_portal_collaboration', { p_project_id: projectId })
  if (error) return fail(null, error.message)
  return ok((data || null) as unknown as ClientPortalCollaboration | null)
}

export async function addClientPortalFeedback(projectId: string, body: string): Promise<Result<ClientMessage | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_client_portal_feedback', { p_project_id: projectId, p_body: body })
  return error ? fail(null, error.message) : ok(data as unknown as ClientMessage)
}

export async function approveClientPortalDelivery(projectId: string, note?: string | null): Promise<Result<ClientApproval | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('approve_client_portal_delivery', { p_project_id: projectId, p_note: note || null })
  return error ? fail(null, error.message) : ok(data as unknown as ClientApproval)
}

export async function requestClientPortalRevision(projectId: string, note: string): Promise<Result<ClientApproval | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('request_client_portal_revision', { p_project_id: projectId, p_note: note })
  return error ? fail(null, error.message) : ok(data as unknown as ClientApproval)
}

export async function shareProjectFileWithClient(projectId: string, fileId: string, note?: string | null): Promise<Result<ClientSharedFile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('share_project_file_with_client', { p_project_id: projectId, p_file_id: fileId, p_note: note || null })
  return error ? fail(null, error.message) : ok(data as unknown as ClientSharedFile)
}

export async function unshareProjectFileWithClient(projectId: string, fileId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('unshare_project_file_with_client', { p_project_id: projectId, p_file_id: fileId })
  return error ? fail(false, error.message) : ok(true)
}

export async function addClientVisibleMessage(projectId: string, body: string): Promise<Result<ClientMessage | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_client_visible_message', { p_project_id: projectId, p_body: body })
  return error ? fail(null, error.message) : ok(data as unknown as ClientMessage)
}

export async function getClientSharedFiles(projectId: string): Promise<Result<ClientSharedFileWithFile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('client_shared_files')
    .select('*, file:files(*)')
    .eq('project_id', projectId)
    .order('shared_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientSharedFileWithFile[])
}

export async function getClientMessages(projectId: string): Promise<Result<ClientMessageWithAuthor[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('client_messages')
    .select('*, author:profiles!client_messages_author_id_fkey(id, full_name, email, role)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientMessageWithAuthor[])
}

export async function getClientApprovals(projectId: string): Promise<Result<ClientApproval[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('client_approvals')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as ClientApproval[])
}

export async function getProjectComments(projectId: string): Promise<Result<CommentWithAuthor[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles!comments_author_id_fkey(id, full_name, email, avatar_url)')
    .eq('entity_type', 'project')
    .eq('entity_id', projectId)
    .order('created_at', { ascending: true })
  return error ? fail([], error.message) : ok((data || []) as unknown as CommentWithAuthor[])
}

export async function addProjectComment(projectId: string, content: string): Promise<Result<Comment | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase
    .from('comments')
    .insert({ content, entity_type: 'project', entity_id: projectId })
    .select()
    .single()
  return error ? fail(null, error.message) : ok(data)
}

// Client account management (Admin only). Mirrors the team-member account
// provisioning flow but for portal accounts linked to a CRM client record.
export type ClientAccountPayload = {
  client_id: string
  email: string
  full_name?: string | null
  status?: ProfileStatus
}

export type ClientAccountUpdatePayload = Partial<ClientAccountPayload> & { id: string }

export async function getClientAccounts(): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('full_name')
  return error ? fail([], error.message) : ok((data as Profile[]) || [])
}

export async function getClientAccountsByClientId(clientId: string): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .eq('client_id', clientId)
    .order('created_at')
  return error ? fail([], error.message) : ok((data as Profile[]) || [])
}

export async function createClientAccount(payload: ClientAccountPayload): Promise<Result<{ profile: Profile; temporaryPassword: string } | null>> {
  if (!supabase) return fail(null)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: payload }),
      cache: 'no-store',
    })
    const result = await response.json() as { data?: Profile; temporary_password?: string; error?: string }
    if (!response.ok || !result.data || !result.temporary_password) {
      return fail(null, result.error || 'Unable to create the client portal account.')
    }
    return ok({ profile: result.data, temporaryPassword: result.temporary_password })
  } catch {
    return fail(null, 'Unable to reach the account provisioning service.')
  }
}

export async function setClientAccountStatus(userId: string, status: ProfileStatus): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: { id: userId, status } }),
      cache: 'no-store',
    })
    if (response.status === 503) return setProfileStatus(userId, status)
    const result = await response.json() as { data?: Profile; error?: string }
    if (!response.ok || !result.data) return fail(null, result.error || 'Unable to update the client account status.')
    return ok(result.data)
  } catch {
    return setProfileStatus(userId, status)
  }
}

export async function updateClientAccount(payload: ClientAccountUpdatePayload): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)

  if (payload.email === undefined && payload.client_id === undefined && payload.status !== undefined) {
    return setClientAccountStatus(payload.id, payload.status)
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: payload }),
      cache: 'no-store',
    })
    const result = await response.json() as { data?: Profile; error?: string }
    if (!response.ok || !result.data) return fail(null, result.error || 'Unable to update the client portal account.')
    return ok(result.data)
  } catch {
    return fail(null, 'Unable to reach the account management service.')
  }
}

export async function deleteClientAccount(userId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(false, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: { id: userId } }),
      cache: 'no-store',
    })
    if (response.status === 503) {
      const { error } = await supabase.rpc('admin_delete_client_account', { p_user_id: userId })
      return error ? fail(false, error.message) : ok(true)
    }
    const result = await response.json() as { data?: boolean; error?: string }
    if (!response.ok) return fail(false, result.error || 'Unable to remove the client portal account.')
    return ok(true)
  } catch {
    return fail(false, 'Unable to reach the account management service.')
  }
}
export async function getClients(): Promise<Result<Client[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('clients').select('*').order('name')
  return error ? fail([], error.message) : ok(data || [])
}

export type ClientListFilter = {
  search?: string
  status?: 'all' | Client['status']
  type?: 'all' | Client['type']
  sort?: 'name' | 'newest' | 'oldest'
}

/** Server-side search, filters, sort, and pagination for the clients
 * directory. Only one page of rows is transferred to the browser. */
export async function getClientsPage(
  filter: ClientListFilter & PageQuery = {}
): Promise<PageResult<Client>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 24)
  const { page = 1, pageSize = 24, sort = 'name' } = filter
  let query = supabase.from('clients').select('*', { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) {
    query = query.or(
      `name.ilike.*${q}*,industry.ilike.*${q}*,contact_person.ilike.*${q}*,contact_position.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*,location.ilike.*${q}*,website.ilike.*${q}*`
    )
  }
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)
  if (filter.type && filter.type !== 'all') query = query.eq('type', filter.type)

  if (sort === 'name') query = query.order('name')
  else if (sort === 'oldest') query = query.order('created_at', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  return executePage<Client>(query, page, pageSize)
}
export async function getClientById(id: string): Promise<Result<Client | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok(data)
}
export async function createClient(client: ClientInsert): Promise<Result<Client | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('clients').insert(client).select().single()
  return error ? fail(null, error.message) : ok(data)
}
export async function updateClient(id: string, updates: ClientUpdate): Promise<Result<Client | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}
export async function deleteClient(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('clients').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
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
  return error ? fail([], error.message) : ok(data || [])
}
export async function createProject(project: ProjectInsert): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').insert(project).select().single()
  return error ? fail(null, error.message) : ok(data)
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
    if (memberError) return fail(data, memberError.message)
  }
  return ok(data)
}
export async function updateProject(id: string, updates: ProjectUpdate): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
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

// Public company portfolio
const PORTFOLIO_ADMIN_SELECT = `id, title, slug, cover_image_path, description, client_name, category_id, services, project_date, external_url, featured, published, archived, display_order, portfolio_categories(id, name, slug, is_active), portfolio_project_images(id, project_id, storage_path, alt_text, display_order)`

const slugifyPortfolio = (value: string) => {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return `${base || 'project'}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}

function publicRpcRowToProject(row: PortfolioPublicRpcRow): PortfolioProjectWithRelations {
  const images = Array.isArray(row.images) ? row.images.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const image = value as Record<string, unknown>
    if (typeof image.id !== 'string' || typeof image.project_id !== 'string' || typeof image.storage_path !== 'string') return []
    return [{
      id: image.id,
      project_id: image.project_id,
      storage_path: image.storage_path,
      alt_text: typeof image.alt_text === 'string' ? image.alt_text : null,
      display_order: typeof image.display_order === 'number' ? image.display_order : 0,
      uploaded_by: null,
      created_at: '',
      image_url: null,
    }]
  }) : []

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    cover_image_path: row.cover_image_path,
    description: row.description,
    client_name: row.client_name,
    category_id: row.category_id,
    services: row.services || [],
    project_date: row.project_date,
    external_url: row.external_url,
    featured: row.featured,
    published: true,
    archived: false,
    display_order: row.display_order,
    created_by: null,
    created_at: '',
    updated_at: '',
    portfolio_categories: row.category_id && row.category_name && row.category_slug
      ? { id: row.category_id, name: row.category_name, slug: row.category_slug, is_active: true }
      : null,
    portfolio_project_images: images,
  }
}

async function hydratePortfolioProjects(rows: unknown[]): Promise<PortfolioProjectWithRelations[]> {
  const projects = rows as PortfolioProjectWithRelations[]
  return Promise.all(projects.map(async (project) => {
    const images = await Promise.all((project.portfolio_project_images || []).map(async (image) => {
      const urlResult = await getPortfolioImageUrl(image.storage_path)
      return { ...image, image_url: urlResult.data }
    }))
    return {
      ...project,
      portfolio_project_images: images.sort((a, b) => a.display_order - b.display_order),
    }
  }))
}

export async function getPortfolioProjects(): Promise<Result<PortfolioProjectWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('portfolio_projects')
    .select(PORTFOLIO_ADMIN_SELECT)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return fail([], error.message)
  return ok(await hydratePortfolioProjects((data || []) as unknown[]))
}

export type PortfolioProjectListFilter = {
  search?: string
  categoryId?: string
  /** 'published' | 'draft' | 'archived' | 'all' (default 'all'). */
  state?: 'all' | 'published' | 'draft' | 'archived'
  featured?: boolean
}

/** Server-side search, category/state/featured filters, and pagination for the
 * portfolio admin list. Ordered by display_order so the reorder controls stay
 * meaningful on every page. */
export async function getPortfolioProjectsPage(
  filter: PortfolioProjectListFilter & PageQuery = {}
): Promise<PageResult<PortfolioProjectWithRelations>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 20)
  const { page = 1, pageSize = 20 } = filter
  let query = supabase
    .from('portfolio_projects')
    .select(PORTFOLIO_ADMIN_SELECT, { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) query = query.or(`title.ilike.*${q}*,client_name.ilike.*${q}*,description.ilike.*${q}*`)
  if (filter.categoryId && filter.categoryId !== 'all') query = query.eq('category_id', filter.categoryId)
  if (filter.state === 'published') query = query.eq('published', true).eq('archived', false)
  else if (filter.state === 'draft') query = query.eq('published', false).eq('archived', false)
  else if (filter.state === 'archived') query = query.eq('archived', true)
  if (filter.featured !== undefined) query = query.eq('featured', filter.featured)

  query = query.order('display_order', { ascending: true }).order('created_at', { ascending: false })
  const result = await executePage<PortfolioProjectWithRelations>(query, page, pageSize)
  if (result.error) return result
  return { ...result, data: await hydratePortfolioProjects(result.data as unknown[]) }
}

export async function getPublicPortfolioProjects(): Promise<Result<PortfolioProjectWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('get_public_portfolio_projects')
  if (error) return fail([], error.message)
  const projects = (data || []).map((row) => publicRpcRowToProject(row as PortfolioPublicRpcRow))
  return ok(await hydratePortfolioProjects(projects))
}

export async function getPublicPortfolioProjectBySlug(slug: string): Promise<Result<PortfolioProjectWithRelations | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_public_portfolio_project', { p_slug: slug })
  if (error) return fail(null, error.message)
  const row = data?.[0]
  if (!row) return ok(null)
  const projects = await hydratePortfolioProjects([publicRpcRowToProject(row as PortfolioPublicRpcRow)])
  return ok(projects[0] || null)
}

export async function createPortfolioProject(input: Omit<PortfolioProjectInsert, 'slug'> & { slug?: string }): Promise<Result<PortfolioProject | null>> {
  if (!supabase) return fail(null)
  const payload: PortfolioProjectInsert = {
    ...input,
    title: input.title.trim(),
    slug: input.slug?.trim() || slugifyPortfolio(input.title),
    description: input.description?.trim() || null,
    client_name: input.client_name?.trim() || null,
    external_url: input.external_url?.trim() || null,
    services: input.services || [],
  }
  const { data, error } = await supabase.from('portfolio_projects').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function updatePortfolioProject(id: string, updates: PortfolioProjectUpdate): Promise<Result<PortfolioProject | null>> {
  if (!supabase) return fail(null)
  const payload = { ...updates }
  if (typeof payload.title === 'string') payload.title = payload.title.trim()
  if (typeof payload.description === 'string') payload.description = payload.description.trim() || null
  if (typeof payload.client_name === 'string') payload.client_name = payload.client_name.trim() || null
  if (typeof payload.external_url === 'string') payload.external_url = payload.external_url.trim() || null
  const { data, error } = await supabase.from('portfolio_projects').update(payload).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function setPortfolioProjectCoverImage(id: string, storagePath: string | null): Promise<Result<PortfolioProject | null>> {
  return updatePortfolioProject(id, { cover_image_path: storagePath })
}

export async function archivePortfolioProject(id: string, archived: boolean): Promise<Result<PortfolioProject | null>> {
  return updatePortfolioProject(id, archived ? { archived: true, published: false } : { archived: false })
}

export async function deletePortfolioProject(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const images = await supabase.from('portfolio_project_images').select('storage_path').eq('project_id', id)
  if (images.error) return fail(false, images.error.message)
  const paths = (images.data || []).map((image) => image.storage_path)
  if (paths.length) {
    const storageResult = await supabase.storage.from('portfolio-images').remove(paths)
    if (storageResult.error) return fail(false, storageResult.error.message)
  }
  const { error } = await supabase.from('portfolio_projects').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function reorderPortfolioProjects(items: { id: string; display_order: number }[]): Promise<Result<boolean>> {
  const client = supabase
  if (!client) return fail(false)
  const results = await Promise.all(items.map((item) => client.from('portfolio_projects').update({ display_order: item.display_order }).eq('id', item.id)))
  const error = results.find((result) => result.error)?.error
  return error ? fail(false, error.message) : ok(true)
}

export async function getPortfolioCategories(includeInactive = true): Promise<Result<PortfolioCategory[]>> {
  if (!supabase) return fail([])
  let query = supabase.from('portfolio_categories').select('*').order('display_order').order('name')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  return error ? fail([], error.message) : ok(data || [])
}

export async function createPortfolioCategory(input: Pick<PortfolioCategoryInsert, 'name'> & Partial<Pick<PortfolioCategoryInsert, 'slug' | 'display_order'>>): Promise<Result<PortfolioCategory | null>> {
  if (!supabase) return fail(null)
  const payload: PortfolioCategoryInsert = {
    name: input.name.trim(),
    slug: input.slug?.trim() || slugifyPortfolio(input.name).replace(/-[a-f0-9]{8}$/, ''),
    display_order: input.display_order ?? 0,
  }
  const { data, error } = await supabase.from('portfolio_categories').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function updatePortfolioCategory(id: string, updates: PortfolioCategoryUpdate): Promise<Result<PortfolioCategory | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('portfolio_categories').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function deletePortfolioCategory(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('portfolio_categories').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function uploadPortfolioImage(projectId: string, userId: string, file: File): Promise<Result<PortfolioProjectImage | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'portfolio-images')
  if (!validation.valid) return fail(null, validation.error || 'Invalid portfolio image.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('portfolio-images').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (upload.error) return fail(null, upload.error.message)

  const latest = await supabase.from('portfolio_project_images').select('display_order').eq('project_id', projectId).order('display_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = (latest.data?.display_order ?? -1) + 1
  const { data, error } = await supabase.from('portfolio_project_images').insert({
    project_id: projectId,
    storage_path: storagePath,
    alt_text: file.name.replace(/\.[^/.]+$/, ''),
    display_order: nextOrder,
    uploaded_by: userId,
  }).select().single()

  if (error) {
    await supabase.storage.from('portfolio-images').remove([storagePath])
    return fail(null, error.message)
  }
  return ok(data)
}

export async function deletePortfolioImage(image: Pick<PortfolioProjectImage, 'id' | 'storage_path'>): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const storageResult = await supabase.storage.from('portfolio-images').remove([image.storage_path])
  if (storageResult.error) return fail(false, storageResult.error.message)
  const { error } = await supabase.from('portfolio_project_images').delete().eq('id', image.id)
  return error ? fail(false, error.message) : ok(true)
}

export async function getPortfolioImageUrl(storagePath: string, expiresIn = STORAGE_RULES['portfolio-images'].signedUrlDurationSeconds || 3600): Promise<Result<string | null>> {
  if (!supabase || !storagePath) return fail(null)
  const { data, error } = await supabase.storage.from('portfolio-images').createSignedUrl(storagePath, expiresIn)
  return error ? fail(null, error.message) : ok(data.signedUrl)
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

const taskActivitySelect = '*, actor:profiles!task_activity_actor_id_fkey(id, full_name, email, avatar_url, job_title)'

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

export async function getFilesByProjectId(projectId: string): Promise<Result<FileItem[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('files').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok(data || [])
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

export async function getProjectCompletionBlockers(projectId: string): Promise<Result<string[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('project_completion_blockers', { p_project_id: projectId })
  return error ? fail([], error.message) : ok((data as string[]) || [])
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

export async function createTask(task: TaskInsert): Promise<Result<Task | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('tasks').insert(task).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function updateTask(id: string, updates: TaskUpdate): Promise<Result<Task | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function deleteTask(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function getFiles(): Promise<Result<FileWithProject[]>> {
  if (!supabase) return fail([])
  const [filesResult, deliveryLinks, deliveryPackages] = await Promise.all([
    supabase.from('files').select('*, projects(id, name)').order('created_at', { ascending: false }),
    supabase.from('project_delivery_files').select('file_id, delivery_id'),
    supabase.from('project_deliveries').select('id, status'),
  ])
  if (filesResult.error) return fail([], filesResult.error.message)
  const openPackages = new Set(
    ((deliveryPackages.data || []) as { id: string; status: string }[])
      .filter((pkg) => pkg.status !== 'superseded')
      .map((pkg) => pkg.id),
  )
  const deliveryIds = new Set(
    ((deliveryLinks.data || []) as { file_id: string; delivery_id: string }[])
      .filter((row) => openPackages.has(row.delivery_id))
      .map((row) => row.file_id),
  )
  const files = ((filesResult.data || []) as unknown as FileWithProject[]).map((file) => ({
    ...file,
    is_delivery: deliveryIds.has(file.id),
  }))
  return ok(files)
}

function getFileType(file: File): FileItem['type'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  if (/spreadsheet|excel|csv/.test(file.type)) return 'spreadsheet'
  if (/zip|compressed|archive/.test(file.type)) return 'archive'
  if (/document|word|text/.test(file.type)) return 'document'
  return 'other'
}

export async function uploadProjectFile(projectId: string, userId: string, file: File, options?: { asDelivery?: boolean }): Promise<Result<FileItem | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'project-files')
  if (!validation.valid) return fail(null, validation.error || 'Invalid project file.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('project-files').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (upload.error) return fail(null, upload.error.message)

  const { data, error } = await supabase.from('files').insert({
    name: file.name,
    type: getFileType(file),
    size: file.size,
    mime_type: file.type || null,
    storage_path: storagePath,
    project_id: projectId,
    uploaded_by: userId,
  }).select().single()

  if (error) {
    await supabase.storage.from('project-files').remove([storagePath])
    return fail(null, error.message)
  }
  if (options?.asDelivery && data) {
    const marked = await addProjectDeliveryFile(projectId, data.id)
    if (marked.error) return fail(data, marked.error)
  }
  return ok(data)
}

export async function getFileDownloadUrl(storagePath: string, expiresIn = STORAGE_RULES['project-files'].signedUrlDurationSeconds || 120): Promise<Result<string | null>> {
  if (!supabase || !storagePath) return fail(null)
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(storagePath, expiresIn)
  return error ? fail(null, error.message) : ok(data.signedUrl)
}

export async function deleteFile(file: Pick<FileItem, 'id' | 'storage_path'>): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  if (file.storage_path) {
    const storageResult = await supabase.storage.from('project-files').remove([file.storage_path])
    if (storageResult.error) return fail(false, storageResult.error.message)
  }
  const { error } = await supabase.from('files').delete().eq('id', file.id)
  return error ? fail(false, error.message) : ok(true)
}

export async function getNotifications(limit = 100): Promise<Result<Notification[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  return error ? fail([], error.message) : ok(data || [])
}

// Notification inbox tabs map onto the domain `event` / UI `type` catalog in
// lib/notifications.ts. The predicates are kept here so the same logic serves
// both the page list and the tab counts.
const NOTIFICATION_EVENTS = {
  submissions: ['submission.created', 'submission.assigned', 'submission.status_changed'],
  projects: ['project.created', 'project.assigned', 'project.deadline_approaching', 'project.overdue', 'team_member.assigned'],
  tasks: ['task.assigned', 'task.updated', 'task.due_soon', 'task.due_today', 'task.overdue'],
  client: ['client.feedback', 'client.approval', 'client.revision', 'file.shared', 'delivery.ready'],
} as const

const NOTIFICATION_TYPES = {
  submissions: ['form_submission', 'submission'],
  projects: ['assignment', 'project_update'],
  tasks: ['task_assignment', 'task_update', 'deadline_reminder'],
  client: ['client_feedback', 'client_approval', 'client_revision', 'file_shared', 'delivery_ready'],
} as const

export type NotificationTabKey = 'all' | 'unread' | 'submissions' | 'projects' | 'tasks' | 'client'

/** Builds the PostgREST `or()` predicate for one inbox tab ('' for 'all'). */
function notificationTabPredicate(tab: NotificationTabKey): string {
  if (tab === 'all' || tab === 'unread') return ''
  const events = NOTIFICATION_EVENTS[tab as keyof typeof NOTIFICATION_EVENTS]
  const types = NOTIFICATION_TYPES[tab as keyof typeof NOTIFICATION_TYPES]
  const quotedEvents = events.map((event) => `"${event}"`).join(',')
  const quotedTypes = types.map((type) => `"${type}"`).join(',')
  return `event.in.(${quotedEvents}),type.in.(${quotedTypes})`
}

export type NotificationListFilter = {
  tab?: NotificationTabKey
  search?: string
}

function notificationSearchPredicate(search: string): string {
  const q = escapeFilterValue(search)
  if (!q) return ''
  return [
    `title.ilike.*${q}*`,
    `message.ilike.*${q}*`,
    `metadata->>client_name.ilike.*${q}*`,
    `metadata->>respondent_name.ilike.*${q}*`,
    `metadata->>form_name.ilike.*${q}*`,
    `metadata->>project_name.ilike.*${q}*`,
    `metadata->>task_title.ilike.*${q}*`,
    `metadata->>assigned_by.ilike.*${q}*`,
  ].join(',')
}

/** Server-side tab filtering, search, and pagination for the notifications
 * inbox. The browser only receives the current page plus the total. */
export async function getNotificationsPage(
  filter: NotificationListFilter & PageQuery = {}
): Promise<PageResult<Notification>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25, tab = 'all' } = filter
  let query = supabase.from('notifications').select('*', { count: 'exact' })

  if (tab === 'unread') query = query.is('read_at', null)
  const tabPredicate = notificationTabPredicate(tab)
  if (tabPredicate) query = query.or(tabPredicate)

  const searchPredicate = notificationSearchPredicate(filter.search || '')
  if (searchPredicate) {
    query = query.or(searchPredicate)
  }

  query = query.order('created_at', { ascending: false })
  return executePage<Notification>(query, page, pageSize)
}

export type NotificationTabCounts = Record<NotificationTabKey, number>

/** Exact per-tab inbox counts computed in the database (cheap head queries). */
export async function getNotificationTabCounts(): Promise<Result<NotificationTabCounts>> {
  if (!supabase) return fail({ all: 0, unread: 0, submissions: 0, projects: 0, tasks: 0, client: 0 })
  const db = supabase
  const head = () => db.from('notifications').select('id', { count: 'exact', head: true })
  const byTab = async (tab: NotificationTabKey) => {
    let query = head()
    if (tab === 'unread') query = query.is('read_at', null)
    const predicate = notificationTabPredicate(tab)
    if (predicate) query = query.or(predicate)
    const { count } = await query
    return count || 0
  }
  const [all, unread, submissions, projects, tasks, client] = await Promise.all([
    head().then((r) => r.count || 0),
    byTab('unread'),
    byTab('submissions'),
    byTab('projects'),
    byTab('tasks'),
    byTab('client'),
  ])
  return ok({ all, unread, submissions, projects, tasks, client })
}

export async function markNotificationRead(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function markNotificationUnread(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: null }).eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function markAllNotificationsRead(): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  return error ? fail(false, error.message) : ok(true)
}

export async function deleteNotification(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function deleteAllReadNotifications(): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').delete().not('read_at', 'is', null)
  return error ? fail(false, error.message) : ok(true)
}

export async function getUnreadNotificationCount(): Promise<Result<number>> {
  if (!supabase) return fail(0)
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)
  return error ? fail(0, error.message) : ok(count || 0)
}

// Dynamic form builder
const slugifyForm = (title: string) => {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${base || 'form'}-${suffix}`
}

export async function getFormTemplates(): Promise<Result<import('./types').FormTemplateWithCounts[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_questions(count), form_submissions(count)')
    .order('updated_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as import('./types').FormTemplateWithCounts[])
}

export type FormTemplateListFilter = {
  search?: string
  status?: 'all' | import('./types').FormTemplate['status']
  sort?: 'updated' | 'created' | 'title'
}

/** Server-side search, status filter, sort, and pagination for the admin form
 * inventory. Question/submission counts stay as embedded aggregates. */
export async function getFormTemplatesPage(
  filter: FormTemplateListFilter & PageQuery = {}
): Promise<PageResult<import('./types').FormTemplateWithCounts>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25, sort = 'updated' } = filter
  let query = supabase
    .from('form_templates')
    .select('*, form_questions(count), form_submissions(count)', { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) query = query.or(`title.ilike.*${q}*,description.ilike.*${q}*`)
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)

  if (sort === 'created') query = query.order('created_at', { ascending: false })
  else if (sort === 'title') query = query.order('title')
  else query = query.order('updated_at', { ascending: false })

  return executePage<import('./types').FormTemplateWithCounts>(query, page, pageSize)
}

/**
 * Public form inventory. Keep this separate from the admin inventory even
 * though RLS also filters rows: a signed-in form manager visiting a public page
 * must never make drafts, disabled forms, or archived forms appear there.
 */
export async function getPublishedFormTemplates(): Promise<Result<import('./types').PublicFormTemplateSummary[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, slug, title, description, status, form_questions(count)')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as import('./types').PublicFormTemplateSummary[])
}

export async function getFormTemplateById(id: string): Promise<Result<import('./types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_templates').select('*').eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok(data)
}

/** Resolve a public form link only while the form is published.
 * The explicit status predicate is intentional defence-in-depth for staff
 * sessions, which can otherwise read every lifecycle state through RLS. */
export async function getPublishedFormTemplateBySlug(slug: string): Promise<Result<import('./types').PublicFormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, slug, title, description, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return error ? fail(null, error.message) : ok(data)
}

export async function createFormTemplate(input: { title: string; description?: string | null }): Promise<Result<import('./types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const payload: import('./types').FormTemplateInsert = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    slug: slugifyForm(input.title),
  }
  const { data, error } = await supabase.from('form_templates').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function updateFormTemplate(id: string, updates: import('./types').FormTemplateUpdate): Promise<Result<import('./types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_templates').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function deleteFormTemplate(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('form_templates').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function duplicateFormTemplate(id: string): Promise<Result<import('./types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('duplicate_form_template', { p_form_id: id })
  return error ? fail(null, error.message) : ok(data)
}

export async function getFormQuestions(formId: string): Promise<Result<import('./types').FormQuestion[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('form_questions').select('*').eq('form_id', formId).order('position').order('created_at')
  return error ? fail([], error.message) : ok(data || [])
}

export async function createFormQuestion(question: import('./types').FormQuestionInsert): Promise<Result<import('./types').FormQuestion | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_questions').insert(question).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function updateFormQuestion(id: string, updates: import('./types').FormQuestionUpdate): Promise<Result<import('./types').FormQuestion | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_questions').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function deleteFormQuestion(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('form_questions').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}

export async function reorderFormQuestions(formId: string, orderedQuestionIds: string[]): Promise<Result<number | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('reorder_form_questions', { p_form_id: formId, p_question_ids: orderedQuestionIds })
  return error ? fail(null, error.message) : ok(data)
}

export async function submitDynamicForm(formId: string, answers: import('@/lib/forms/question-types').AnswerMap): Promise<Result<import('./types').FormSubmission | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('submit_dynamic_form', { p_form_id: formId, p_answers: answers as unknown as import('./types').Json })
  return error ? fail(null, error.message) : ok(data)
}

export async function getPublicSubmissionTracking(trackingKey: string): Promise<Result<import('./types').PublicSubmissionTracking | null>> {
  if (!supabase) return fail(null)
  const cleanKey = trackingKey.trim()
  if (!cleanKey) return fail(null, 'Please provide a valid reference number or tracking token.')
  const { data, error } = await supabase.rpc('get_public_submission_tracking', { p_tracking_key: cleanKey })
  if (error) return fail(null, error.message)
  if (!data) return fail(null, 'No submission found matching this reference number or tracking link.')
  return ok(data as unknown as import('./types').PublicSubmissionTracking)
}

export async function getFormSubmissions(formId: string): Promise<Result<import('./types').FormSubmission[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('form_submissions').select('*').eq('form_id', formId).order('submitted_at', { ascending: false })
  return error ? fail([], error.message) : ok(data || [])
}

export async function getAllFormSubmissions(): Promise<Result<(import('./types').FormSubmission & { form_templates?: { title: string; slug: string } | null })[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, form_templates(title, slug)')
    .order('submitted_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as (import('./types').FormSubmission & { form_templates?: { title: string; slug: string } | null })[])
}

/** Submission inbox row: the submission joined to its form title and its
 * current reviewer/owner (internal team member). */
export type AdminSubmissionRow = import('./types').FormSubmission & {
  form_templates?: { title: string; slug: string } | null
  reviewer?: Pick<import('./types').Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}

export async function getAdminInboxSubmissions(): Promise<Result<AdminSubmissionRow[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, form_templates(title, slug), reviewer:profiles!form_submissions_reviewer_id_fkey(id, full_name, email, avatar_url, job_title)')
    .order('submitted_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as AdminSubmissionRow[])
}

export type SubmissionInboxFilter = {
  search?: string
  status?: 'all' | 'assigned_to_me' | SubmissionStatus
  reviewer?: 'all' | 'assigned_to_me' | 'unassigned' | string
  formId?: string
  sort?: 'newest' | 'oldest' | 'status'
}

/** Server-side search, filters, workflow-priority sort, and pagination for the
 * submission review inbox. Runs through the `get_submission_inbox_page`
 * SECURITY INVOKER RPC so search covers the form title and reviewer name too,
 * the "workflow priority" sort stays correct across pages, and the exact total
 * comes back in the same round trip. RLS still applies to every row read. */
export async function getSubmissionInboxPage(
  filter: SubmissionInboxFilter & PageQuery = {}
): Promise<PageResult<AdminSubmissionRow>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25 } = filter

  let reviewerId: string | null = null
  let reviewerMode: 'assigned_to_me' | 'unassigned' | null = null
  if (filter.reviewer === 'assigned_to_me' || filter.reviewer === 'unassigned') reviewerMode = filter.reviewer
  else if (filter.reviewer && filter.reviewer !== 'all') reviewerId = filter.reviewer

  const { data, error } = await supabase.rpc('get_submission_inbox_page', {
    p_search: filter.search?.trim() || null,
    p_status: filter.status && filter.status !== 'all' ? filter.status : null,
    p_reviewer_mode: reviewerMode,
    p_reviewer_id: reviewerId,
    p_form_id: filter.formId && filter.formId !== 'all' ? filter.formId : null,
    p_sort: filter.sort || 'newest',
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) return pagedFail(page, pageSize, error.message)
  const payload = (data || {}) as { data?: unknown; total?: number }
  return {
    data: (payload.data as AdminSubmissionRow[]) || [],
    total: payload.total || 0,
    page,
    pageSize,
    error: null,
  }
}

export type SubmissionPipelineCounts = {
  byStatus: Record<string, number>
  assignedToMe: number
  total: number
}

/** Pipeline summary counts for the submission inbox — aggregated entirely in
 * the database, never by shipping the full inbox to the browser. */
export async function getSubmissionPipelineCounts(): Promise<Result<SubmissionPipelineCounts>> {
  if (!supabase) return fail({ byStatus: {}, assignedToMe: 0, total: 0 })
  const { data, error } = await supabase.rpc('get_submission_pipeline_counts')
  if (error) return fail({ byStatus: {}, assignedToMe: 0, total: 0 }, error.message)
  const payload = (data || {}) as { total?: number; by_status?: Record<string, number> | null; assigned_to_me?: number }
  return ok({
    byStatus: payload.by_status || {},
    assignedToMe: payload.assigned_to_me || 0,
    total: payload.total || 0,
  })
}

export async function getAdminInboxSubmission(id: string): Promise<Result<AdminSubmissionRow | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, form_templates(title, slug), reviewer:profiles!form_submissions_reviewer_id_fkey(id, full_name, email, avatar_url, job_title)')
    .eq('id', id)
    .maybeSingle()
  return error ? fail(null, error.message) : ok(data as unknown as AdminSubmissionRow | null)
}

export async function getFormSubmissionDetails(submissionId: string): Promise<Result<{
  answers: import('./types').FormSubmissionAnswer[]
  attachments: import('./types').FormSubmissionAttachment[]
  notes: import('./types').FormSubmissionNote[]
  events: import('./types').FormSubmissionEvent[]
}>> {
  if (!supabase) return fail({ answers: [], attachments: [], notes: [], events: [] })
  const [answersResult, attachmentsResult, notesResult, eventsResult] = await Promise.all([
    supabase.from('form_submission_answers').select('*').eq('submission_id', submissionId).order('created_at'),
    supabase.from('form_submission_attachments').select('*').eq('submission_id', submissionId).order('created_at'),
    supabase
      .from('form_submission_notes')
      .select('*, author:profiles!form_submission_notes_author_id_fkey(id, full_name, email, avatar_url, job_title)')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false }),
    supabase
      .from('form_submission_events')
      .select('*, actor:profiles!form_submission_events_actor_id_fkey(id, full_name, email, avatar_url, job_title)')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false }),
  ])
  if (answersResult.error) return fail({ answers: [], attachments: [], notes: [], events: [] }, answersResult.error.message)
  if (attachmentsResult.error) return fail({ answers: [], attachments: [], notes: [], events: [] }, attachmentsResult.error.message)
  return ok({
    answers: answersResult.data || [],
    attachments: attachmentsResult.data || [],
    notes: (notesResult.data || []) as unknown as import('./types').FormSubmissionNote[],
    events: (eventsResult.data || []) as unknown as import('./types').FormSubmissionEvent[],
  })
}

export async function getFormSubmissionNotes(submissionId: string): Promise<Result<import('./types').FormSubmissionNote[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_submission_notes')
    .select('*, author:profiles!form_submission_notes_author_id_fkey(id, full_name, email, avatar_url, job_title)')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as import('./types').FormSubmissionNote[])
}

export async function addFormSubmissionNote(submissionId: string, note: string): Promise<Result<import('./types').FormSubmissionNote | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_form_submission_note', {
    p_submission_id: submissionId,
    p_note: note,
  })
  return error ? fail(null, error.message) : ok(data as unknown as import('./types').FormSubmissionNote)
}

export async function deleteFormSubmissionNote(noteId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('delete_form_submission_note', {
    p_note_id: noteId,
  })
  return error ? fail(false, error.message) : ok(true)
}

export async function getFormSubmissionEvents(submissionId: string): Promise<Result<import('./types').FormSubmissionEvent[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_submission_events')
    .select('*, actor:profiles!form_submission_events_actor_id_fkey(id, full_name, email, avatar_url, job_title)')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as import('./types').FormSubmissionEvent[])
}

export type SubmissionProjectConversionInput = {
  submissionId: string
  clientId: string | null
  newClient: {
    name: string
    type: Client['type']
    contact_person: string | null
    email: string | null
    phone: string | null
  } | null
  projectName: string
  description: string | null
  projectType: string
  priority: ProjectPriority
  status: ProjectStatus
  phase: number
  phaseName: string | null
  startDate: string | null
  dueDate: string | null
  budget: number | null
  currency: string
  ownerId: string
  managerId: string | null
  teamMemberIds: string[]
}

export async function convertSubmissionToProject(
  input: SubmissionProjectConversionInput
): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('convert_submission_to_project', {
    p_submission_id: input.submissionId,
    p_client_id: input.clientId,
    p_new_client: input.newClient as import('./types').Json | null,
    p_project_name: input.projectName,
    p_description: input.description,
    p_project_type: input.projectType,
    p_priority: input.priority,
    p_status: input.status,
    p_phase: input.phase,
    p_phase_name: input.phaseName,
    p_start_date: input.startDate,
    p_due_date: input.dueDate,
    p_budget: input.budget,
    p_currency: input.currency,
    p_owner_id: input.ownerId,
    p_manager_id: input.managerId,
    p_team_member_ids: input.teamMemberIds,
  })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}

export async function updateFormSubmissionStatus(
  id: string,
  status: import('./types').SubmissionStatus,
  note?: string
): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('update_form_submission_status', {
    p_submission_id: id,
    p_status: status,
    p_note: note?.trim() || null,
  })
  return error ? fail(false, error.message) : ok(true)
}

export async function assignFormSubmissionReviewer(
  id: string,
  reviewerId: string | null,
  note?: string
): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('assign_form_submission_reviewer', {
    p_submission_id: id,
    p_reviewer_id: reviewerId,
    p_note: note?.trim() || null,
  })
  return error ? fail(false, error.message) : ok(true)
}

export async function uploadFormFile(userId: string, file: File): Promise<Result<import('@/lib/forms/question-types').UploadedFileMeta | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'form-files')
  if (!validation.valid) return fail(null, validation.error || 'Invalid form attachment.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('form-files').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (upload.error) return fail(null, upload.error.message)
  return ok({ storage_path: storagePath, name: file.name, size: file.size, mime_type: file.type || null })
}

export async function getFormFileUrl(storagePath: string, expiresIn = STORAGE_RULES['form-files'].signedUrlDurationSeconds || 120): Promise<Result<string | null>> {
  if (!supabase || !storagePath) return fail(null)
  const { data, error } = await supabase.storage.from('form-files').createSignedUrl(storagePath, expiresIn)
  return error ? fail(null, error.message) : ok(data.signedUrl)
}

// Team Management
export type TeamMemberPayload = {
  email: string
  full_name: string
  phone?: string | null
  whatsapp?: string | null
  avatar_url?: string | null
  job_title?: string | null
  department?: string | null
  specialization?: string | null
  bio?: string | null
  location?: string | null
  portfolio_url?: string | null
  social_links?: Record<string, string> | null
  role_id?: string | null
  employee_role_id?: string | null
  status?: ProfileStatus
}

export type TeamMemberUpdatePayload = Partial<TeamMemberPayload> & { id: string }

export async function getTeamMembers(): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'client')
    .order('full_name')
  return error ? fail([], error.message) : ok((data as Profile[]) || [])
}

export type TeamMemberListFilter = {
  search?: string
  /** Dynamic role id ('' or 'all' disables the filter). */
  roleId?: string
  /** Legacy role key (admin/manager/employee) — OR'd with roleId when both
   * are set so dynamic and legacy role assignments both match. */
  roleKey?: string
  status?: 'all' | ProfileStatus
  /** Exact match on department OR specialization ('' or 'all' disables). */
  department?: string
}

/** Server-side search, filters, and pagination for team directories and the
 * admin team table. Client accounts are always excluded, matching the legacy
 * full-list helper. */
export async function getTeamMembersPage(
  filter: TeamMemberListFilter & PageQuery = {}
): Promise<PageResult<Profile>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25 } = filter
  let query = supabase.from('profiles').select('*', { count: 'exact' }).neq('role', 'client')

  const q = escapeFilterValue(filter.search || '')
  if (q) {
    query = query.or(
      `full_name.ilike.*${q}*,email.ilike.*${q}*,job_title.ilike.*${q}*,department.ilike.*${q}*,specialization.ilike.*${q}*,location.ilike.*${q}*`
    )
  }
  const roleParts: string[] = []
  if (filter.roleId && filter.roleId !== 'all' && filter.roleId !== '') roleParts.push(`role_id.eq.${filter.roleId}`)
  if (filter.roleKey && filter.roleKey !== 'all' && filter.roleKey !== '') roleParts.push(`role.eq.${filter.roleKey}`)
  if (roleParts.length) query = query.or(roleParts.join(','))
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)
  if (filter.department && filter.department !== 'all' && filter.department !== '') {
    query = query.or(`department.eq.${filter.department},specialization.eq.${filter.department}`)
  }

  query = query.order('full_name')
  return executePage<Profile>(query, page, pageSize)
}

/** Distinct department/specialization values for filter dropdowns — a light
 * projection, not the full member list. */
export async function getTeamMemberDepartments(): Promise<Result<string[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('profiles')
    .select('department, specialization')
    .neq('role', 'client')
    .limit(1000)
  if (error) return fail([], error.message)
  const departments = new Set<string>()
  for (const row of data || []) {
    const item = row as { department?: string | null; specialization?: string | null }
    if (item.department) departments.add(item.department)
    if (item.specialization) departments.add(item.specialization)
  }
  return ok([...departments].sort((a, b) => a.localeCompare(b)))
}

export async function getTeamMemberById(id: string): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return fail(null, error.message)
  if (data && data.role === 'client') return ok(null)
  return ok(data)
}

export async function createTeamMember(payload: TeamMemberPayload): Promise<Result<{ profile: Profile; temporaryPassword: string } | null>> {
  if (!supabase) return fail(null)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/team-members', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      // The temporary password is generated on the server and returned once;
      // the browser never chooses or sends it.
      body: JSON.stringify({ member: payload }),
      cache: 'no-store',
    })
    const result = await response.json() as { data?: Profile; temporary_password?: string; error?: string }
    if (!response.ok || !result.data || !result.temporary_password) {
      return fail(null, result.error || 'Unable to create the team account.')
    }
    return ok({ profile: result.data, temporaryPassword: result.temporary_password })
  } catch {
    return fail(null, 'Unable to reach the account provisioning service.')
  }
}

export async function setTeamMemberStatus(userId: string, status: ProfileStatus): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/team-members', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ member: { id: userId, status } }),
      cache: 'no-store',
    })
    // The server route additionally syncs the Supabase Auth sign-in ban. When
    // the service role is not configured on the server, fall back to the
    // permission-checked RPC: the workspace is still blocked through RLS/UI.
    if (response.status === 503) return setProfileStatus(userId, status)
    const result = await response.json() as { data?: Profile; error?: string }
    if (!response.ok || !result.data) return fail(null, result.error || 'Unable to update the member status.')
    return ok(result.data)
  } catch {
    return setProfileStatus(userId, status)
  }
}

export async function updateTeamMember(payload: TeamMemberUpdatePayload): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)

  // Status toggles go through the protected route so the profile status and the
  // Supabase Auth sign-in ban stay in sync.
  if (payload.email === undefined && payload.status !== undefined) {
    return setTeamMemberStatus(payload.id, payload.status)
  }

  if (payload.email !== undefined) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

    try {
      const response = await fetch('/api/admin/team-members', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ member: payload }),
        cache: 'no-store',
      })
      const result = await response.json() as { data?: Profile; error?: string }
      if (!response.ok || !result.data) return fail(null, result.error || 'Unable to update the team account.')
      return ok(result.data)
    } catch {
      return fail(null, 'Unable to reach the account management service.')
    }
  }

  const { data, error } = await supabase.rpc('admin_update_team_member', {
    p_user_id: payload.id,
    p_email: payload.email || null,
    p_full_name: payload.full_name || null,
    p_phone: payload.phone || null,
    p_whatsapp: payload.whatsapp || null,
    p_avatar_url: payload.avatar_url || null,
    p_job_title: payload.job_title || null,
    p_department: payload.department || null,
    p_specialization: payload.specialization || null,
    p_bio: payload.bio || null,
    p_location: payload.location || null,
    p_portfolio_url: payload.portfolio_url || null,
    p_social_links: (payload.social_links as unknown as import('./types').Json) || null,
    p_role_id: payload.role_id || null,
    p_employee_role_id: payload.employee_role_id || null,
    p_status: payload.status || null,
  })
  return error ? fail(null, error.message) : ok(data)
}

export async function deleteTeamMember(userId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('admin_delete_team_member', { p_user_id: userId })
  return error ? fail(false, error.message) : ok(true)
}

export async function uploadTeamAvatar(userId: string, file: File): Promise<Result<string | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'avatars')
  if (!validation.valid) return fail(null, validation.error || 'Invalid avatar image.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from('avatars').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (error) return fail(null, error.message)
  const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath)
  return ok(data.publicUrl)
}

export type StorageAuditSummary = {
  project_files_count: number
  form_attachments_count: number
  intake_attachments_count: number
  portfolio_images_count: number
  profiles_with_avatar_count: number
  storage_objects_total: number
  unreferenced_storage_objects_count: number
  audited_at: string
}

export async function getStorageAuditSummary(): Promise<Result<StorageAuditSummary | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_storage_audit_summary')
  if (error) return fail(null, error.message)
  return ok(data as unknown as StorageAuditSummary)
}

/**
 * Resolves the storage path of an avatar stored in the public `avatars` bucket
 * from its public URL. Returns null for external image URLs, malformed URLs and
 * empty values, so callers can safely clean up replaced/removed avatars.
 */
export function avatarStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const marker = '/storage/v1/object/public/avatars/'
    const index = parsed.pathname.indexOf(marker)
    if (index === -1) return null
    const path = parsed.pathname.slice(index + marker.length)
    return path ? decodeURIComponent(path) : null
  } catch {
    return null
  }
}

/** Removes an avatar object from the public `avatars` bucket. */
export async function deleteTeamAvatar(storagePath: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.storage.from('avatars').remove([storagePath])
  return error ? fail(false, error.message) : ok(true)
}

export async function getAvatarPublicUrl(storagePath: string): Promise<Result<string | null>> {
  if (!supabase) return fail(null)
  if (storagePath.startsWith('http')) return ok(storagePath)
  const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath)
  return ok(data.publicUrl)
}

// Enhanced profile functions
export async function getProfileById(id: string): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok(data)
}

export async function updateOwnEnhancedProfile(userId: string, updates: {
  full_name?: string
  phone?: string
  whatsapp?: string
  bio?: string
  job_title?: string
  skills?: string
  experience?: string
  previous_projects?: string
  certifications?: string
  location?: string
  portfolio_url?: string
  linkedin?: string
  behance?: string
  instagram?: string
  facebook?: string
  twitter?: string
  personal_website?: string
  other_social_links?: Record<string, string>
  avatar_url?: string
}): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  
  const { data, error } = await supabase.rpc('update_own_enhanced_profile', {
    p_user_id: userId,
    p_full_name: updates.full_name || null,
    p_phone: updates.phone || null,
    p_whatsapp: updates.whatsapp || null,
    p_bio: updates.bio || null,
    p_job_title: updates.job_title || null,
    p_skills: updates.skills || null,
    p_experience: updates.experience || null,
    p_previous_projects: updates.previous_projects || null,
    p_certifications: updates.certifications || null,
    p_location: updates.location || null,
    p_portfolio_url: updates.portfolio_url || null,
    p_linkedin: updates.linkedin || null,
    p_behance: updates.behance || null,
    p_instagram: updates.instagram || null,
    p_facebook: updates.facebook || null,
    p_twitter: updates.twitter || null,
    p_personal_website: updates.personal_website || null,
    p_other_social_links: (updates.other_social_links as unknown as import('./types').Json) || null,
    p_avatar_url: updates.avatar_url || null,
  })
  
  return error ? fail(null, error.message) : ok(data as Profile | null)
}

export async function markPasswordChanged(userId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('mark_password_changed', { p_user_id: userId })
  return error ? fail(false, error.message) : ok(true)
}

/**
 * Collects every social link stored on a profile — the admin-managed
 * `social_links` JSON, the self-service platform columns (linkedin, behance,
 * instagram, facebook, twitter, personal_website) and the custom
 * `other_social_links` JSON — into a single key → URL map. Individual columns
 * win over the same key stored in the JSON maps.
 */
export function collectSocialLinks(profile: Profile): Record<string, string> {
  const links: Record<string, string> = {}

  const absorb = (value: import('./types').Json | null | undefined) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item === 'string' && item.trim()) {
        links[key] = item.trim()
      }
    })
  }

  absorb(profile.social_links)
  absorb(profile.other_social_links)

  // Individual self-service columns win over JSON maps.
  const columnKeys = ['linkedin', 'behance', 'instagram', 'facebook', 'twitter', 'personal_website'] as const
  for (const column of columnKeys) {
    const value = profile[column]
    if (typeof value === 'string' && value.trim()) links[column] = value.trim()
  }

  return links
}

export async function getSocialLinks(profile: Profile): Promise<Record<string, string>> {
  return collectSocialLinks(profile)
}
