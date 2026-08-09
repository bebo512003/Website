'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, KeyRound, LoaderCircle, Pencil, Plus, Save, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  addPermission,
  assignUserRole,
  createAppRole,
  deleteAppRole,
  getAppRoles,
  getPermissions,
  getProfiles,
  setRolePermissions,
  updateAppRole,
} from '@/lib/supabase/database'
import type { AppRoleWithPermissions, Permission, Profile } from '@/lib/supabase/types'
import { permissionCategories, permissionName } from '@/lib/permissions'
import { EmptyState, InlineAlert, LoadingState, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

export function RolesPermissionsAdmin() {
  const { can } = useAuth()
  const [roles, setRoles] = useState<AppRoleWithPermissions[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Create role form
  const [roleForm, setRoleForm] = useState({ name: '', description: '' })
  // Add permission form
  const [permForm, setPermForm] = useState({ key: '', name: '', category: 'general', description: '' })
  // Expanded role permission editor
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set())
  // Role edit (name/desc/active)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', is_active: true })
  // Employee assignment
  const [assignRoleId, setAssignRoleId] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [rolesResult, permResult, profilesResult] = await Promise.all([getAppRoles(), getPermissions(), getProfiles()])
    setRoles(rolesResult.data)
    setPermissions(permResult.data)
    setProfiles(profilesResult.data)
    setError(rolesResult.error || permResult.error || profilesResult.error || '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  const teamProfiles = useMemo(() => profiles.filter((profile) => profile.role !== 'client'), [profiles])
  const activeRoles = useMemo(() => roles.filter((role) => role.is_active), [roles])
  const categories = useMemo(() => permissionCategories(), [])

  const openPermissionEditor = (role: AppRoleWithPermissions) => {
    if (expandedRoleId === role.id) {
      setExpandedRoleId(null)
      return
    }
    setExpandedRoleId(role.id)
    setDraftKeys(new Set(role.permission_keys))
  }

  const toggleDraft = (key: string) => {
    setDraftKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const savePermissions = async (roleId: string) => {
    setSaving(true)
    setError('')
    const result = await setRolePermissions(roleId, [...draftKeys])
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setExpandedRoleId(null)
    setMessage(`Permissions updated for “${roleById.get(roleId)?.name}”.`)
    await load()
  }

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!roleForm.name.trim()) return
    setSaving(true)
    setError('')
    const result = await createAppRole(roleForm.name.trim(), roleForm.description.trim())
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setRoleForm({ name: '', description: '' })
    setMessage('Role created. Assign permissions to it, then assign it to employees.')
    await load()
  }

  const submitPermission = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await addPermission(permForm.key.trim(), permForm.name.trim(), permForm.category.trim() || 'general', permForm.description.trim())
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setPermForm({ key: '', name: '', category: 'general', description: '' })
    setMessage('Permission added to the catalog. Assign it to roles as needed.')
    await load()
  }

  const startEditRole = (role: AppRoleWithPermissions) => {
    setEditingRoleId(role.id)
    setEditForm({ name: role.name, description: role.description || '', is_active: role.is_active })
  }

  const saveRoleEdit = async (roleId: string) => {
    setSaving(true)
    setError('')
    const result = await updateAppRole(roleId, editForm.name.trim(), editForm.description.trim(), editForm.is_active)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setEditingRoleId(null)
    setMessage('Role updated.')
    await load()
  }

  const removeRole = async (role: AppRoleWithPermissions) => {
    if (role.is_system) return
    if (!window.confirm(`Delete the role “${role.name}”? People assigned to it keep their current permissions until reassigned.`)) return
    setError('')
    const result = await deleteAppRole(role.id)
    if (result.error) { setError(result.error); return }
    setMessage('Role deleted.')
    await load()
  }

  const assignRole = async (userId: string, roleId: string) => {
    setError('')
    const result = await assignUserRole(userId, roleId)
    if (result.error) setError(result.error)
    else setMessage('Role assigned to employee.')
  }

  if (loading) return <Panel><LoadingState label="Loading roles & permissions…" /></Panel>

  return (
    <div className="grid gap-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Create role" description="Roles carry only the permissions you explicitly grant. New roles can be assigned to employees and edited later.">
          <form onSubmit={submitRole} className="grid gap-3 p-5">
            <input required placeholder="Role name (e.g. Data Manager)" className={inputClassName} value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} />
            <input placeholder="Description (optional)" className={inputClassName} value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
            <button className={primaryButtonClassName} disabled={saving || !can('role.create')}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create role</button>
          </form>
        </Panel>

        <Panel title="Add permission" description="Extend the permission catalog — new permissions can be reused in RLS and route guards without code changes.">
          <form onSubmit={submitPermission} className="grid gap-3 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <input required placeholder="Key (e.g. report.export)" className={inputClassName} value={permForm.key} onChange={(event) => setPermForm({ ...permForm, key: event.target.value })} />
              <input required placeholder="Display name" className={inputClassName} value={permForm.name} onChange={(event) => setPermForm({ ...permForm, name: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input placeholder="Category (default: general)" className={inputClassName} value={permForm.category} onChange={(event) => setPermForm({ ...permForm, category: event.target.value })} />
              <input placeholder="Description (optional)" className={inputClassName} value={permForm.description} onChange={(event) => setPermForm({ ...permForm, description: event.target.value })} />
            </div>
            <button className={secondaryButtonClassName} disabled={saving || !can('permission.manage')}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add permission</button>
          </form>
        </Panel>
      </div>

      <Panel title="Roles" description="A role grants nothing by itself — only the permissions explicitly assigned below.">
        {roles.length === 0 ? <EmptyState icon={KeyRound} title="No roles" description="Create the first role above." /> : (
          <div className="divide-y divide-border">
            {roles.map((role) => {
              const editing = editingRoleId === role.id
              return (
                <div key={role.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <button type="button" onClick={() => openPermissionEditor(role)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${expandedRoleId === role.id ? 'rotate-180' : ''}`} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                          {role.name}
                          <span className="rounded border border-border px-1.5 py-0.5 font-mono-tech text-[9px] text-text-tertiary">{role.key}</span>
                          {role.is_system && <span className="rounded border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] text-accent">system</span>}
                          {!role.is_active && <span className="rounded border border-red-500/30 bg-red-500/5 px-1.5 py-0.5 text-[10px] text-red-400">inactive</span>}
                        </span>
                        {role.description && <span className="mt-1 block truncate text-xs text-text-tertiary">{role.description}</span>}
                        <span className="mt-1 block text-[10px] text-text-tertiary">{role.permission_keys.length} permission{role.permission_keys.length === 1 ? '' : 's'} assigned</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {editing ? (
                        <>
                          <button onClick={() => void saveRoleEdit(role.id)} className={primaryButtonClassName} disabled={!can('role.edit')}><Save className="h-4 w-4" />Save</button>
                          <button onClick={() => setEditingRoleId(null)} className={secondaryButtonClassName}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditRole(role)} className="rounded-md border border-border p-2 text-text-tertiary hover:text-fg" aria-label={`Edit ${role.name}`}><Pencil className="h-4 w-4" /></button>
                          {!role.is_system && <button onClick={() => void removeRole(role)} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${role.name}`}><Trash2 className="h-4 w-4" /></button>}
                        </>
                      )}
                    </div>
                  </div>

                  {editing && (
                    <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto]">
                      <input aria-label="Role name" className={inputClassName} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
                      <input aria-label="Role description" className={inputClassName} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} placeholder="Description" />
                      <label className="flex items-center gap-2 text-xs text-text-secondary">
                        <input type="checkbox" checked={editForm.is_active} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--accent))]" />
                        Active
                      </label>
                    </div>
                  )}

                  {expandedRoleId === role.id && (
                    <div className="mt-3 border-t border-border pt-4">
                      <p className="mb-3 text-xs text-text-secondary">Grant or revoke permissions for this role. These are enforced by the database, not just the UI.</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {categories.map((category) => {
                          const catPerms = permissions.filter((permission) => permission.category === category)
                          if (!catPerms.length) return null
                          return (
                            <div key={category} className="rounded-md border border-border p-4">
                              <p className="mb-2 font-mono-tech text-[10px] uppercase tracking-wide text-text-tertiary">{category}</p>
                              <div className="space-y-2">
                                {catPerms.map((permission) => (
                                  <label key={permission.id} className="flex cursor-pointer items-start gap-2 text-sm text-text-secondary">
                                    <input type="checkbox" checked={draftKeys.has(permission.key)} onChange={() => toggleDraft(permission.key)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]" />
                                    <span>
                                      <span className="block font-medium text-fg">{permissionName(permission.key)}</span>
                                      {permission.description && <span className="block text-xs text-text-tertiary">{permission.description}</span>}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setExpandedRoleId(null)} className={secondaryButtonClassName}>Cancel</button>
                        <button onClick={() => void savePermissions(role.id)} className={primaryButtonClassName} disabled={saving || !can('role.assign_permissions')}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Save permissions</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel title="Assign roles to employees" description="Choose the role each team member carries. Their permissions update immediately; role names never imply permissions.">
        {teamProfiles.length === 0 ? <EmptyState icon={UserRound} title="No employees" description="Team members appear here once they have signed up." /> : (
          <div className="divide-y divide-border">
            {teamProfiles.map((profile) => (
              <div key={profile.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{profile.full_name || 'Unnamed user'}</p>
                  <p className="mt-1 truncate text-xs text-text-tertiary">{profile.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label={`Role for ${profile.email}`}
                    className={inputClassName}
                    value={assignRoleId[profile.id] ?? profile.role_id ?? ''}
                    onChange={(event) => { const value = event.target.value; setAssignRoleId((current) => ({ ...current, [profile.id]: value })); if (value) void assignRole(profile.id, value) }}
                    disabled={!can('employee.manage')}
                  >
                    <option value="">No role</option>
                    {activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.is_system ? ' (system)' : ''}</option>)}
                  </select>
                  <div className="hidden w-48 truncate text-right text-xs text-text-tertiary sm:block">
                    {profile.role_id && roleById.get(profile.role_id) ? `${roleById.get(profile.role_id)!.name}: ${roleById.get(profile.role_id)!.permission_keys.length} perms` : 'No role assigned'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
