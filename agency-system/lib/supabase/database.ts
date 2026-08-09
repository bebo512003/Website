import { isDatabaseConnected, supabase } from './client'
import type {
  AccessRole,
  AppRole,
  AppRoleWithPermissions,
  Client,
  ClientInsert,
  ClientUpdate,
  EmployeeRole,
  EmployeeRoleInsert,
  EmployeeRoleUpdate,
  FileItem,
  FileWithProject,
  IntakeForm,
  Notification,
  Permission,
  Profile,
  ProfileStatus,
  Project,
  ProjectInsert,
  ProjectMember,
  ProjectUpdate,
  ProjectWithClient,
  Task,
  TaskInsert,
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

export function getDatabaseStatus() {
  return { connected: isDatabaseConnected }
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

// ── Role / permission system ──────────────────────────────────────────────────
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

// Client portal: RLS scopes this to submissions the signed-in client created or owns.
export async function getClientIntakeSubmissions(): Promise<Result<IntakeForm[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('intake_forms').select('*').order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok(data || [])
}

export async function getClients(): Promise<Result<Client[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('clients').select('*').order('name')
  return error ? fail([], error.message) : ok(data || [])
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

export async function getProjects(): Promise<Result<ProjectWithClient[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('projects').select('*, clients(id, name)').order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as ProjectWithClient[])
}

export async function getProjectById(id: string): Promise<Result<ProjectWithClient | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').select('*, clients(id, name)').eq('id', id).maybeSingle()
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

export async function updateProject(id: string, updates: ProjectUpdate): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function deleteProject(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
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

export async function getTasks(): Promise<Result<TaskWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('tasks').select('*, projects(id, name), profiles!tasks_assignee_id_fkey(id, full_name, email)').order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskWithRelations[])
}

export async function getTasksByProjectId(projectId: string): Promise<Result<TaskWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('tasks').select('*, projects(id, name), profiles!tasks_assignee_id_fkey(id, full_name, email)').eq('project_id', projectId).order('created_at')
  return error ? fail([], error.message) : ok((data || []) as unknown as TaskWithRelations[])
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
  const { data, error } = await supabase.from('files').select('*, projects(id, name)').order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as FileWithProject[])
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

export async function uploadProjectFile(projectId: string, userId: string, file: File): Promise<Result<FileItem | null>> {
  if (!supabase) return fail(null)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('project-files').upload(storagePath, file, { contentType: file.type, upsert: false })
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
  return ok(data)
}

export async function getFileDownloadUrl(storagePath: string): Promise<Result<string | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(storagePath, 60)
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

export async function getNotifications(limit = 50): Promise<Result<Notification[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  return error ? fail([], error.message) : ok(data || [])
}

export async function markNotificationRead(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
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

export async function createIntakeForm(form: import('./types').IntakeFormInsert): Promise<Result<import('./types').IntakeForm | null>> {
  if (!supabase) return fail(null)
  // Ensure service_types is populated from service_type if not provided.
  const payload = { ...form }
  if (!payload.service_types || payload.service_types.length === 0) {
    if (payload.service_type) payload.service_types = [payload.service_type]
  }
  const { data, error } = await supabase.from('intake_forms').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function updateIntakeForm(id: string, form: import('./types').IntakeFormUpdate): Promise<Result<import('./types').IntakeForm | null>> {
  if (!supabase) return fail(null)
  // Ensure service_types is populated from service_type if needed.
  const payload = { ...form }
  if (payload.service_type && (!payload.service_types || payload.service_types.length === 0)) {
    payload.service_types = [payload.service_type]
  }
  const { data, error } = await supabase.from('intake_forms').update(payload).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}

export async function submitIntakeForm(id: string): Promise<Result<import('./types').IntakeForm | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('submit_intake_form', { target_intake_id: id })
  return error ? fail(null, error.message) : ok(data)
}

export async function uploadIntakeAttachment(intakeId: string, userId: string, file: File): Promise<Result<import('./types').IntakeAttachment | null>> {
  if (!supabase) return fail(null)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${userId}/${intakeId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('intake-files').upload(storagePath, file, { contentType: file.type, upsert: false })
  if (upload.error) return fail(null, upload.error.message)
  const { data, error } = await supabase.from('intake_attachments').insert({ intake_id: intakeId, name: file.name, size: file.size, mime_type: file.type || null, storage_path: storagePath, uploaded_by: userId }).select().single()
  if (error) { await supabase.storage.from('intake-files').remove([storagePath]); return fail(null, error.message) }
  return ok(data)
}
