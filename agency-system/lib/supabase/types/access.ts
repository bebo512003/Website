/**
 * access — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

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


export type Permission = PermissionRow

export type AccessRole = AppRoleRow

export type RolePermission = RolePermissionRow
