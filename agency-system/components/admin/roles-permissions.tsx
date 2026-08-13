'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, KeyRound, LoaderCircle, Pencil, Plus, Save, ShieldAlert, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  assignUserRole,
  createAppRole,
  deleteAppRole,
  getAppRoles,
  getPermissions,
  getProfiles,
  setRolePermissions,
  updateAppRole,
} from '@/lib/db'
import type { AppRoleWithPermissions, Permission, Profile } from '@/lib/supabase/types'
import { ROLE_CAPABILITY_MATRIX, ROLE_MATRIX_LABELS, categoryLabel, categorySlug, compareCategories, permissionName } from '@/lib/permissions'
import { EmptyState, InlineAlert, LoadingState, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { useConfirm } from '@/components/ui/confirm-dialog'

type PermissionGroup = { slug: string; label: string; items: Permission[] }

function setsEqual(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) return false
  return b.every((key) => a.has(key))
}

/**
 * Grouped checkbox grid — the heart of the role editor.
 *
 * Every checkbox is one row from the `permissions` table (loaded from the
 * database, not hardcoded). Checking a box and saving writes the selection to
 * `role_permissions` through the permission-gated `set_role_permissions` RPC,
 * and RLS enforces it immediately. No permission keys are ever typed by hand.
 */
function PermissionGrid({
  groups,
  selected,
  onToggleKey,
  onToggleCategory,
  disabled,
}: {
  groups: PermissionGroup[]
  selected: Set<string>
  onToggleKey: (key: string, checked: boolean) => void
  onToggleCategory: (keys: string[], checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const checkedCount = group.items.filter((permission) => selected.has(permission.key)).length
        const allChecked = checkedCount === group.items.length
        const someChecked = checkedCount > 0 && !allChecked
        return (
          <fieldset key={group.slug} className="rounded-md border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <input
                  type="checkbox"
                  checked={allChecked}
                  disabled={disabled}
                  ref={(el) => { if (el) el.indeterminate = someChecked }}
                  onChange={() => onToggleCategory(group.items.map((permission) => permission.key), !allChecked)}
                  aria-label={`Select all ${group.label} permissions`}
                  className="h-3.5 w-3.5 accent-[hsl(var(--accent))]"
                />
                {group.label}
              </label>
              <span className="font-mono-tech text-[9px] text-text-tertiary">{checkedCount}/{group.items.length}</span>
            </div>
            <div className="space-y-2.5">
              {group.items.map((permission) => (
                <label key={permission.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(permission.key)}
                    disabled={disabled}
                    onChange={(event) => onToggleKey(permission.key, event.target.checked)}
                    aria-label={permission.name}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                  />
                  <span>
                    <span className="block font-medium leading-tight text-fg">{permission.name}</span>
                    {permission.description && <span className="mt-0.5 block text-xs leading-snug text-text-tertiary">{permission.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

export function RolesPermissionsAdmin() {
  const { can, profile, refreshPermissions } = useAuth()
  const confirm = useConfirm()
  const [roles, setRoles] = useState<AppRoleWithPermissions[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Create-role form: name + description + the permission checkboxes.
  const [createForm, setCreateForm] = useState({ name: '', description: '' })
  const [createKeys, setCreateKeys] = useState<Set<string>>(new Set())
  // Expanded role editor: role details + permission checkboxes.
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set())
  const [editForm, setEditForm] = useState({ name: '', description: '', is_active: true })
  // Employee assignment
  const [assignRoleId, setAssignRoleId] = useState<Record<string, string>>({})

  const canManagePermissions = can('role.assign_permissions')

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

  // Group the database permission catalog for the checkbox grid. Categories come
  // from the DB rows themselves (source of truth), labelled for humans.
  const groups = useMemo<PermissionGroup[]>(() => {
    const bySlug = new Map<string, Permission[]>()
    for (const permission of permissions) {
      const slug = categorySlug(permission.category)
      const list = bySlug.get(slug)
      if (list) list.push(permission)
      else bySlug.set(slug, [permission])
    }
    return [...bySlug.entries()]
      .sort(([a], [b]) => compareCategories(a, b))
      .map(([slug, items]) => ({
        slug,
        label: categoryLabel(slug),
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [permissions])

  // Revoking the "Manage system" permission can lock every Admin out of the
  // administration area, so confirm it explicitly. Because the accessible
  // confirm dialog is async, the toggle handlers below are async too — they
  // await the user's answer before updating the draft permission set.
  const confirmRevoke = async (key: string, checked: boolean): Promise<boolean> => {
    if (key !== 'admin.manage' || checked) return true
    return confirm({
      title: 'Revoke “Manage system”?',
      description: 'If no role keeps this permission, nobody will be able to open the administration area anymore — including you.',
      confirmLabel: 'Revoke permission',
      tone: 'destructive',
    })
  }

  const toggleKeys = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    async (key: string, checked: boolean) => {
      if (!(await confirmRevoke(key, checked))) return
      setter((current) => {
        const next = new Set(current)
        if (checked) next.add(key)
        else next.delete(key)
        return next
      })
    }

  const toggleCategoryKeys = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    async (keys: string[], checked: boolean) => {
      if (!checked && keys.includes('admin.manage') && !(await confirmRevoke('admin.manage', false))) return
      setter((current) => {
        const next = new Set(current)
        for (const key of keys) {
          if (checked) next.add(key)
          else next.delete(key)
        }
        return next
      })
    }

  const openPermissionEditor = (role: AppRoleWithPermissions) => {
    if (expandedRoleId === role.id) {
      setExpandedRoleId(null)
      return
    }
    setExpandedRoleId(role.id)
    setDraftKeys(new Set(role.permission_keys))
    setEditForm({ name: role.name, description: role.description || '', is_active: role.is_active })
  }

  // The current (expanded) role being edited, for dirty-state tracking.
  const expandedRole = expandedRoleId ? roleById.get(expandedRoleId) : undefined
  const dirty = !!expandedRole && (
    !setsEqual(draftKeys, expandedRole.permission_keys)
    || editForm.name.trim() !== expandedRole.name
    || editForm.description.trim() !== (expandedRole.description || '')
    || editForm.is_active !== expandedRole.is_active
  )

  const submitCreateRole = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = createForm.name.trim()
    if (!name) return
    setSaving(true)
    setError('')
    setMessage('')
    const created = await createAppRole(name, createForm.description.trim())
    if (created.error) {
      setSaving(false)
      setError(created.error)
      return
    }
    const roleId = created.data?.id
    if (roleId && createKeys.size > 0) {
      const granted = await setRolePermissions(roleId, [...createKeys])
      if (granted.error) {
        setSaving(false)
        setError(`The role was created, but its permissions could not be saved: ${granted.error}. Open the role below and tick the permissions again.`)
        await load()
        return
      }
    }
    setSaving(false)
    setCreateForm({ name: '', description: '' })
    setCreateKeys(new Set())
    setMessage(`Role “${name}” created with ${createKeys.size} permission${createKeys.size === 1 ? '' : 's'}. Assign it to employees below — they get exactly what you checked.`)
    await load()
  }

  const saveRoleEditor = async (role: AppRoleWithPermissions) => {
    setSaving(true)
    setError('')
    setMessage('')
    let failed = ''

    const metaChanged =
      editForm.name.trim() !== role.name
      || editForm.description.trim() !== (role.description || '')
      || editForm.is_active !== role.is_active
    const permsChanged = !setsEqual(draftKeys, role.permission_keys)

    if (metaChanged) {
      const result = await updateAppRole(role.id, editForm.name.trim(), editForm.description.trim(), editForm.is_active)
      if (result.error) failed = result.error
    }
    if (!failed && permsChanged) {
      const result = await setRolePermissions(role.id, [...draftKeys])
      if (result.error) failed = result.error
    }

    setSaving(false)
    if (failed) { setError(failed); return }

    setExpandedRoleId(null)
    setMessage(permsChanged
      ? `Saved. The database now enforces the new permissions for “${editForm.name.trim() || role.name}” immediately.`
      : 'Role updated.')
    // If this role is the one the signed-in Admin carries themselves, refresh
    // their live permission set so the UI matches the database right away.
    if (profile?.role_id === role.id) await refreshPermissions()
    await load()
  }

  const removeRole = async (role: AppRoleWithPermissions) => {
    if (role.is_system) return
    const ok = await confirm({
      title: `Delete the role “${role.name}”?`,
      description: 'Employees assigned to it lose its permissions immediately.',
      confirmLabel: 'Delete role',
      tone: 'destructive',
    })
    if (!ok) return
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
    else setMessage('Role assigned. The employee’s access updates immediately.')
  }

  if (loading) return <Panel><LoadingState label="Loading roles & permissions…" /></Panel>

  const allPermissionKeys = permissions.map((permission) => permission.key)

  return (
    <div className="grid gap-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <Panel title="Capability matrix" description="What the four system roles receive by default. Custom roles start empty — they get only the boxes you check. Role names never imply extra access.">
        <div className="overflow-x-auto" tabIndex={0} aria-label="Scrollable capability matrix">
          <table className="min-w-[640px] divide-y divide-border text-left">
            <thead className="bg-surface-raised">
              <tr className="text-[11px] uppercase tracking-wide text-text-tertiary">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Default capabilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(['admin', 'manager', 'employee', 'client'] as const).map((key) => (
                <tr key={key}>
                  <td className="align-top px-5 py-4">
                    <p className="text-sm font-semibold text-fg">{ROLE_MATRIX_LABELS[key].name}</p>
                    <p className="mt-1 max-w-xs text-xs text-text-tertiary">{ROLE_MATRIX_LABELS[key].summary}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(key === 'admin' ? ['Every permission in the catalog'] : ROLE_CAPABILITY_MATRIX[key].map((permission) => permissionName(permission))).map((label) => (
                        <span key={label} className="rounded border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-text-secondary">{label}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="align-top px-5 py-4">
                  <p className="text-sm font-semibold text-fg">Custom roles</p>
                  <p className="mt-1 max-w-xs text-xs text-text-tertiary">Created below. Nothing is granted until you tick the checkboxes and save.</p>
                </td>
                <td className="px-5 py-4 text-xs text-text-tertiary">Exactly the checked boxes. Opening the matching area no longer requires Manage system.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Create a role"
        description="Give the role a name, then simply check what people with this role should be allowed to do. No need to write any permission names — unchecked boxes mean “not allowed”."
      >
        <form onSubmit={submitCreateRole} className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input required placeholder="Role name (e.g. Manager)" aria-label="Role name" className={inputClassName} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} />
            <input placeholder="Description (optional)" aria-label="Role description" className={inputClassName} value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} />
          </div>

          {permissions.length === 0 ? (
            <InlineAlert>The permission catalog could not be loaded. Reload the page or check your database connection.</InlineAlert>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Permissions for this role</p>
                <div className="flex gap-2">
                  <button type="button" className={secondaryButtonClassName} onClick={() => void toggleCategoryKeys(setCreateKeys)(allPermissionKeys, true)}>Select all</button>
                  <button type="button" className={secondaryButtonClassName} onClick={() => setCreateKeys(new Set())}>Clear all</button>
                </div>
              </div>
              <PermissionGrid
                groups={groups}
                selected={createKeys}
                onToggleKey={toggleKeys(setCreateKeys)}
                onToggleCategory={toggleCategoryKeys(setCreateKeys)}
                disabled={!canManagePermissions}
              />
            </>
          )}

          <div className="flex justify-end">
            <button className={primaryButtonClassName} disabled={saving || !can('role.create') || !canManagePermissions}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create role{createKeys.size > 0 ? ` with ${createKeys.size} permission${createKeys.size === 1 ? '' : 's'}` : ''}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Roles" description="Click a role to review or change what it can do. Checked boxes are exactly what the database enforces — nothing is hidden only in the interface.">
        {roles.length === 0 ? <EmptyState icon={KeyRound} title="No roles" description="Create the first role above." /> : (
          <div className="divide-y divide-border">
            {roles.map((role) => {
              const expanded = expandedRoleId === role.id
              return (
                <div key={role.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <button type="button" onClick={() => openPermissionEditor(role)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`} />
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
                      {!role.is_system && <button onClick={() => void removeRole(role)} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${role.name}`}><Trash2 className="h-4 w-4" /></button>}
                      <button onClick={() => openPermissionEditor(role)} className={secondaryButtonClassName} aria-label={`Edit permissions of ${role.name}`}>
                        <Pencil className="h-4 w-4" />{expanded ? 'Close' : 'Edit permissions'}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        <input aria-label="Role name" className={inputClassName} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} disabled={!can('role.edit')} />
                        <input aria-label="Role description" className={inputClassName} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} placeholder="Description" disabled={!can('role.edit')} />
                        <label className="flex items-center gap-2 text-xs text-text-secondary">
                          <input type="checkbox" checked={editForm.is_active} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })} disabled={!can('role.edit')} className="h-4 w-4 accent-[hsl(var(--accent))]" />
                          Active
                        </label>
                      </div>

                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-text-secondary">Check what this role should be allowed to do, then press <strong>Save permissions</strong>. Changes take effect immediately for everyone with this role.</p>
                        <div className="flex gap-2">
                          <button type="button" className={secondaryButtonClassName} onClick={() => void toggleCategoryKeys(setDraftKeys)(allPermissionKeys, true)} disabled={!canManagePermissions}>Select all</button>
                          <button type="button" className={secondaryButtonClassName} onClick={() => void confirmRevoke('admin.manage', false).then((ok) => { if (ok) setDraftKeys(new Set()) })} disabled={!canManagePermissions}>Clear all</button>
                        </div>
                      </div>

                      {permissions.length === 0 ? (
                        <InlineAlert>The permission catalog could not be loaded. Reload the page or check your database connection.</InlineAlert>
                      ) : (
                        <PermissionGrid
                          groups={groups}
                          selected={draftKeys}
                          onToggleKey={toggleKeys(setDraftKeys)}
                          onToggleCategory={toggleCategoryKeys(setDraftKeys)}
                          disabled={!canManagePermissions}
                        />
                      )}

                      {!canManagePermissions && (
                        <div className="mt-3"><InlineAlert>Your account does not have the “Assign permissions to roles” permission, so the checkboxes are read-only for you.</InlineAlert></div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {dirty && (
                          <span className="mr-auto flex items-center gap-1.5 text-xs text-amber-500"><ShieldAlert className="h-3.5 w-3.5" />Unsaved changes</span>
                        )}
                        <button onClick={() => setExpandedRoleId(null)} className={secondaryButtonClassName}>Cancel</button>
                        <button onClick={() => void saveRoleEditor(role)} className={primaryButtonClassName} disabled={saving || !dirty || (!canManagePermissions && !can('role.edit'))}>
                          {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                          <Save className="h-4 w-4" />Save permissions
                        </button>
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
            {teamProfiles.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{member.full_name || 'Unnamed user'}</p>
                  <p className="mt-1 truncate text-xs text-text-tertiary">{member.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label={`Role for ${member.email}`}
                    className={inputClassName}
                    value={assignRoleId[member.id] ?? member.role_id ?? ''}
                    onChange={(event) => { const value = event.target.value; setAssignRoleId((current) => ({ ...current, [member.id]: value })); if (value) void assignRole(member.id, value) }}
                    disabled={!can('employee.manage')}
                  >
                    <option value="">No role</option>
                    {activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.is_system ? ' (system)' : ''}</option>)}
                  </select>
                  <div className="hidden w-48 truncate text-right text-xs text-text-tertiary sm:block">
                    {member.role_id && roleById.get(member.role_id) ? `${roleById.get(member.role_id)!.name}: ${roleById.get(member.role_id)!.permission_keys.length} perms` : 'No role assigned'}
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
