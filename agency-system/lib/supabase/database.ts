import { isDatabaseConnected, supabase } from './client'
import { validateFile, sanitizeFileName, STORAGE_RULES } from '@/lib/storage-config'
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
  ClientFormSubmission,
  FileWithProject,
  Notification,
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

export async function getFormSubmissionDetails(submissionId: string): Promise<Result<{ answers: import('./types').FormSubmissionAnswer[]; attachments: import('./types').FormSubmissionAttachment[] }>> {
  if (!supabase) return fail({ answers: [], attachments: [] })
  const [answersResult, attachmentsResult] = await Promise.all([
    supabase.from('form_submission_answers').select('*').eq('submission_id', submissionId).order('created_at'),
    supabase.from('form_submission_attachments').select('*').eq('submission_id', submissionId).order('created_at'),
  ])
  if (answersResult.error) return fail({ answers: [], attachments: [] }, answersResult.error.message)
  if (attachmentsResult.error) return fail({ answers: [], attachments: [] }, attachmentsResult.error.message)
  return ok({ answers: answersResult.data || [], attachments: attachmentsResult.data || [] })
}

export async function updateFormSubmissionStatus(id: string, status: 'submitted' | 'archived'): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('form_submissions').update({ status }).eq('id', id)
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
