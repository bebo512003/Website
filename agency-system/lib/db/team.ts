/**
 * team repository — data access for the team domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, PageQuery, PageResult, pagedFail, escapeFilterValue, executePage } from './shared'
import { validateFile, sanitizeFileName } from '../storage-config'
import type { AppRole, EmployeeRole, EmployeeRoleInsert, EmployeeRoleUpdate, Profile, ProfileStatus } from '../supabase/types'
export async function getProfiles(): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  return error ? fail([], error.message) : ok((data || []) as unknown as Profile[])
}


export async function setProfileStatus(userId: string, status: ProfileStatus): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_user_status', { target_user_id: userId, new_status: status })
  return error ? fail(null, error.message) : ok(data as unknown as Profile | null)
}


export async function setProfileClientLink(userId: string, clientId: string | null): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('set_user_client_link', { target_user_id: userId, new_client_id: clientId })
  return error ? fail(null, error.message) : ok(data as unknown as Profile | null)
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
  return ok(data as unknown as Profile | null)
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
    p_social_links: (payload.social_links as unknown as import('../supabase/types').Json) || null,
    p_role_id: payload.role_id || null,
    p_employee_role_id: payload.employee_role_id || null,
    p_status: payload.status || null,
  })
  return error ? fail(null, error.message) : ok(data as unknown as Profile | null)
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



