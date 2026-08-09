'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Briefcase, Eye, LoaderCircle, Pencil, Plus, Search, Trash2, UserCog, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  createTeamMember,
  deleteTeamMember,
  getAppRoles,
  getEmployeeRoles,
  getTeamMembers,
  updateTeamMember,
  uploadTeamAvatar,
  setProfileStatus,
} from '@/lib/supabase/database'
import type { AppRoleWithPermissions, EmployeeRole, Profile } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type SocialLinks = Record<string, string>

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  whatsapp: '',
  avatar_url: '',
  job_title: '',
  department: '',
  specialization: '',
  bio: '',
  location: '',
  portfolio_url: '',
  social_links: {} as SocialLinks,
  role_id: '',
  employee_role_id: '',
  status: 'active' as 'active' | 'inactive',
}

export function TeamManagement() {
  const { can } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<AppRoleWithPermissions[]>([])
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [viewing, setViewing] = useState<Profile | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')

  const canManage = can('employee.manage') || can('admin.manage')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [membersRes, rolesRes, empRolesRes] = await Promise.all([getTeamMembers(), getAppRoles(), getEmployeeRoles()])
    setMembers(membersRes.data || [])
    setRoles(rolesRes.data || [])
    setEmployeeRoles(empRolesRes.data || [])
    setError(membersRes.error || rolesRes.error || empRolesRes.error || '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles])
  const employeeRoleMap = useMemo(() => new Map(employeeRoles.map(r => [r.id, r])), [employeeRoles])

  // Exclude client role from assignment list
  const assignableRoles = useMemo(() => roles.filter(r => r.key !== 'client' && r.is_active), [roles])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(m =>
      (m.full_name?.toLowerCase().includes(q)) ||
      m.email.toLowerCase().includes(q) ||
      (m.job_title?.toLowerCase().includes(q)) ||
      (m.department?.toLowerCase().includes(q)) ||
      (m.specialization?.toLowerCase().includes(q))
    )
  }, [members, search])

  const resetForm = () => {
    setForm(emptyForm)
    setAvatarFile(null)
    setAvatarPreview('')
    setEditing(null)
  }

  const openAdd = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEdit = (member: Profile) => {
    const social = (member.social_links as SocialLinks) || {}
    setForm({
      full_name: member.full_name || '',
      email: member.email,
      phone: member.phone || '',
      whatsapp: (member as any).whatsapp || '',
      avatar_url: member.avatar_url || '',
      job_title: (member as any).job_title || '',
      department: (member as any).department || '',
      specialization: (member as any).specialization || '',
      bio: member.bio || '',
      location: (member as any).location || '',
      portfolio_url: (member as any).portfolio_url || '',
      social_links: social,
      role_id: member.role_id || '',
      employee_role_id: member.employee_role_id || '',
      status: (member.status as any) || 'active',
    })
    setAvatarPreview(member.avatar_url || '')
    setEditing(member)
    setModalOpen(true)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setAvatarFile(file)
    if (file) {
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  const handleSocialChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, social_links: { ...prev.social_links, [key]: value } }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Full Name and Email are required')
      return
    }
    if (!canManage) {
      setError('You do not have permission to manage team members')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')

    let avatarUrl = form.avatar_url
    // Upload avatar if file selected
    if (avatarFile) {
      const targetId = editing?.id || 'new'
      const up = await uploadTeamAvatar(targetId, avatarFile)
      if (up.error) {
        setError(up.error)
        setSaving(false)
        return
      }
      if (up.data) avatarUrl = up.data
    }

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      avatar_url: avatarUrl || null,
      job_title: form.job_title.trim() || null,
      department: form.department.trim() || null,
      specialization: form.specialization.trim() || null,
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
      portfolio_url: form.portfolio_url.trim() || null,
      social_links: Object.fromEntries(Object.entries(form.social_links).filter(([_, v]) => v.trim() !== '')),
      role_id: form.role_id || null,
      employee_role_id: form.employee_role_id || null,
      status: form.status,
    }

    let result
    if (editing) {
      result = await updateTeamMember({ id: editing.id, ...payload })
    } else {
      // For new members, ensure role_id defaults to employee if not set
      if (!payload.role_id) {
        const employeeSystem = roles.find(r => r.key === 'employee')
        if (employeeSystem) payload.role_id = employeeSystem.id
      }
      result = await createTeamMember(payload as any)
    }

    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }

    setMessage(editing ? 'Team member updated successfully' : 'Team member added successfully')
    setModalOpen(false)
    resetForm()
    await load()
  }

  const toggleStatus = async (member: Profile) => {
    if (!canManage) {
      setError('Permission denied')
      return
    }
    const newStatus = member.status === 'active' ? 'inactive' : 'active'
    setError('')
    const res = await setProfileStatus(member.id, newStatus as any)
    if (res.error) {
      // Fallback to direct update
      const upd = await updateTeamMember({ id: member.id, status: newStatus as any })
      if (upd.error) {
        setError(upd.error)
        return
      }
    }
    setMessage(`Member ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
    await load()
  }

  const handleDelete = async (member: Profile) => {
    if (!canManage) return
    if (!window.confirm(`Delete team member "${member.full_name || member.email}"? This cannot be undone.`)) return
    const res = await deleteTeamMember(member.id)
    if (res.error) {
      setError(res.error)
      return
    }
    setMessage('Team member deleted')
    await load()
  }

  if (loading) {
    return <Panel><LoadingState label="Loading team members…" /></Panel>
  }

  return (
    <div className="space-y-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <Panel title="Team Management" description="View, add, edit, activate/deactivate team members. Roles come from the dynamic Role system. Team members are always Employees/Internal Users, never Clients.">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              placeholder="Search by name, email, job title, department…"
              className={`${inputClassName} pl-10`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={openAdd} className={primaryButtonClassName} disabled={!canManage}>
            <Plus className="h-4 w-4" />
            Add Team Member
          </button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="No team members" description={search ? 'No members match your search' : 'Add your first team member to get started'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-raised">
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-tertiary">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Job Title / Department</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((member) => {
                  const role = member.role_id ? roleMap.get(member.role_id) : null
                  const jobRole = member.employee_role_id ? employeeRoleMap.get(member.employee_role_id) : null
                  return (
                    <tr key={member.id} className="hover:bg-surface-raised/50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-surface-raised">
                            {member.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={member.avatar_url} alt={member.full_name || ''} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-text-tertiary">
                                {(member.full_name?.[0] || member.email[0] || 'U').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-fg">{member.full_name || 'Unnamed'}</p>
                            <p className="truncate text-xs text-text-tertiary">{member.email}</p>
                            {(member as any).location && <p className="truncate text-[11px] text-text-tertiary">{(member as any).location}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-fg">{(member as any).job_title || jobRole?.name || '—'}</p>
                        <p className="text-xs text-text-tertiary">{(member as any).department || (member as any).specialization || '—'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit rounded border border-border px-2 py-0.5 text-xs text-fg">
                            {role?.name || member.role}
                          </span>
                          {jobRole && <span className="text-[11px] text-text-tertiary">{jobRole.name}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${member.status === 'active' ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-red-500/30 bg-red-500/5 text-red-400'}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewing(member)}
                            className="rounded-md border border-border p-2 text-text-tertiary hover:text-fg"
                            title="View profile"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(member)}
                            className="rounded-md border border-border p-2 text-text-tertiary hover:text-fg"
                            title="Edit member"
                            disabled={!canManage}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => void toggleStatus(member)}
                            className={`rounded-md border px-2.5 py-2 text-xs ${member.status === 'active' ? 'border-border text-text-tertiary hover:border-red-500/30 hover:text-red-400' : 'border-green-500/30 text-green-400 hover:bg-green-500/5'}`}
                            disabled={!canManage}
                          >
                            {member.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => void handleDelete(member)}
                            className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400"
                            title="Delete"
                            disabled={!canManage}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title={editing ? 'Edit Team Member' : 'Add Team Member'} description="Team members are always Employee/Internal Users, not Clients. Roles come from the dynamic Role system.">
        <form onSubmit={handleSubmit} className="grid gap-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-surface-raised">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-tertiary"><Users className="h-6 w-6" /></div>
              )}
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-text-secondary">
                Profile Photo
                <input type="file" accept="image/*" onChange={handleAvatarChange} className={`${inputClassName} mt-2`} />
              </label>
              <input
                placeholder="Or paste image URL"
                className={inputClassName}
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-text-secondary">Full Name *
              <input required className={`${inputClassName} mt-2`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Alex Morgan" />
            </label>
            <label className="text-xs text-text-secondary">Email *
              <input required type="email" className={`${inputClassName} mt-2`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alex@agency.com" />
            </label>
            <label className="text-xs text-text-secondary">Phone / WhatsApp
              <input className={`${inputClassName} mt-2`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 234 567 890" />
            </label>
            <label className="text-xs text-text-secondary">WhatsApp (separate if needed)
              <input className={`${inputClassName} mt-2`} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+1 234 567 891" />
            </label>
            <label className="text-xs text-text-secondary">Job Title
              <input className={`${inputClassName} mt-2`} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. Senior Designer" />
            </label>
            <label className="text-xs text-text-secondary">Department
              <input className={`${inputClassName} mt-2`} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Design, Development" />
            </label>
            <label className="text-xs text-text-secondary">Specialization
              <input className={`${inputClassName} mt-2`} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="e.g. UI/UX, Branding" />
            </label>
            <label className="text-xs text-text-secondary">Location
              <input className={`${inputClassName} mt-2`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Cairo, Remote" />
            </label>
            <label className="text-xs text-text-secondary">Portfolio URL
              <input type="url" className={`${inputClassName} mt-2`} value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} placeholder="https://portfolio.example.com" />
            </label>
            <label className="text-xs text-text-secondary">Account Status
              <select className={`${inputClassName} mt-2`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-text-secondary">Role (from Role system) *
              <select className={`${inputClassName} mt-2`} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} required>
                <option value="">Select role</option>
                {assignableRoles.map(r => <option key={r.id} value={r.id}>{r.name} {r.is_system ? '(system)' : ''} — {r.permission_keys.length} perms</option>)}
              </select>
            </label>
            <label className="text-xs text-text-secondary">Job Role (Designer, Translator…)
              <select className={`${inputClassName} mt-2`} value={form.employee_role_id} onChange={(e) => setForm({ ...form, employee_role_id: e.target.value })}>
                <option value="">No job role</option>
                {employeeRoles.filter(r => r.is_active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>

          <label className="text-xs text-text-secondary">Short Bio
            <textarea className={`${inputClassName} mt-2 min-h-20`} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Brief bio about the team member…" />
          </label>

          <div className="rounded-md border border-border p-4">
            <p className="mb-3 text-xs font-semibold text-fg">Social Links (JSON)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {['linkedin', 'github', 'twitter', 'behance', 'dribbble', 'website'].map(key => (
                <label key={key} className="text-xs text-text-secondary capitalize">{key}
                  <input className={`${inputClassName} mt-1`} value={form.social_links[key] || ''} onChange={(e) => handleSocialChange(key, e.target.value)} placeholder={`https://${key}.com/...`} />
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClassName} onClick={() => { setModalOpen(false); resetForm() }}>Cancel</button>
            <button className={primaryButtonClassName} disabled={saving}>
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Profile Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.full_name || 'Team Member Profile'} description={viewing?.email}>
        {viewing && (
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-border bg-surface-raised">
                {viewing.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewing.avatar_url} alt={viewing.full_name || ''} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-text-tertiary">
                    {(viewing.full_name?.[0] || viewing.email[0]).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-fg">{viewing.full_name}</p>
                <p className="text-sm text-text-tertiary">{viewing.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded border border-border px-2 py-0.5 text-xs">{roleMap.get(viewing.role_id || '')?.name || viewing.role}</span>
                  {(viewing as any).job_title && <span className="rounded border border-border px-2 py-0.5 text-xs">{(viewing as any).job_title}</span>}
                  <span className={`rounded border px-2 py-0.5 text-xs ${viewing.status === 'active' ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>{viewing.status}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-md border border-border p-4 text-sm">
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Phone</span><span className="col-span-2 text-fg">{viewing.phone || '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">WhatsApp</span><span className="col-span-2 text-fg">{(viewing as any).whatsapp || '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Department</span><span className="col-span-2 text-fg">{(viewing as any).department || '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Specialization</span><span className="col-span-2 text-fg">{(viewing as any).specialization || '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Location</span><span className="col-span-2 text-fg">{(viewing as any).location || '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Portfolio</span><span className="col-span-2 truncate text-fg">{(viewing as any).portfolio_url ? <a href={(viewing as any).portfolio_url} target="_blank" rel="noreferrer" className="text-accent underline">{(viewing as any).portfolio_url}</a> : '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Job Role</span><span className="col-span-2 text-fg">{employeeRoleMap.get(viewing.employee_role_id || '')?.name || '—'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-text-tertiary">Bio</span><span className="col-span-2 text-fg">{viewing.bio || '—'}</span></div>
            </div>

            {(viewing.social_links as any) && Object.keys(viewing.social_links as any).length > 0 && (
              <div className="rounded-md border border-border p-4">
                <p className="mb-2 text-xs font-semibold text-fg">Social Links</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries((viewing.social_links as SocialLinks)).map(([k, v]) => v ? (
                    <a key={k} href={v} target="_blank" rel="noreferrer" className="rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:text-fg capitalize">
                      {k}
                    </a>
                  ) : null)}
                </div>
              </div>
            )}

            <div className="rounded-md border border-border p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg"><UserCog className="h-4 w-4" /> Role Permissions</p>
              {roleMap.get(viewing.role_id || '') ? (
                <div className="flex flex-wrap gap-1.5">
                  {roleMap.get(viewing.role_id || '')!.permission_keys.map(pk => (
                    <span key={pk} className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-text-tertiary">{pk}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-tertiary">No role assigned</p>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => { if (viewing) { const v = viewing; setViewing(null); openEdit(v) } }} className={primaryButtonClassName} disabled={!canManage}>
                <Pencil className="h-4 w-4" /> Edit member
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
