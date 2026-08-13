/**
 * access repository — data access for the access domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok } from './shared'
import type { AccessRole, AppRoleWithPermissions, Permission, Profile } from '../supabase/types'
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

