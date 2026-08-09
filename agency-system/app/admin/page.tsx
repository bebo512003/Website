'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Briefcase, FolderKanban, KeyRound, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, UserRound, UserCog, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { RolesPermissionsAdmin } from '@/components/admin/roles-permissions'
import {
  addProjectMember,
  createEmployeeRole,
  createProject,
  deleteEmployeeRole,
  deleteProject,
  getClients,
  getEmployeeRoles,
  getProfiles,
  getProjectMembers,
  getProjects,
  removeProjectMember,
  setProfileClientLink,
  setProfileEmployeeRole,
  setProfileRole,
  setProfileStatus,
  updateEmployeeRole,
} from '@/lib/supabase/database'
import type { AppRole, Client, EmployeeRole, Profile, ProfileStatus, ProjectMember, ProjectStatus, ProjectWithClient } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type Tab = 'team' | 'roles' | 'clients' | 'projects' | 'access' | 'permissions'
type MemberWithProfile = ProjectMember & { profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null }

const systemRoles: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'client', label: 'Client' },
]

const emptyProjectForm = {
  name: '',
  description: '',
  client_id: '',
  type: 'General',
  status: 'active' as ProjectStatus,
  due_date: '',
  budget: '',
  currency: 'USD',
}

const slugify = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `role_${crypto.randomUUID().slice(0, 8)}`

export default function AdminPage() {
  const { isAdmin, user } = useAuth()
  const [tab, setTab] = useState<Tab>('team')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([])
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectForm, setProjectForm] = useState(emptyProjectForm)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [roleForm, setRoleForm] = useState({ name: '', description: '' })
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [roleEditForm, setRoleEditForm] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [profileResult, projectResult, clientResult, employeeRoleResult] = await Promise.all([getProfiles(), getProjects(), getClients(), getEmployeeRoles()])
    setProfiles(profileResult.data)
    setProjects(projectResult.data)
    setClients(clientResult.data)
    setEmployeeRoles(employeeRoleResult.data)
    setError(profileResult.error || projectResult.error || clientResult.error || employeeRoleResult.error || '')
    setSelectedProjectId((current) => current || projectResult.data[0]?.id || '')
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { void load() }, [load])

  const loadMembers = useCallback(async () => {
    if (!selectedProjectId) {
      setMembers([])
      return
    }
    const result = await getProjectMembers(selectedProjectId)
    setMembers(result.data)
    if (result.error) setError(result.error)
  }, [selectedProjectId])

  useEffect(() => { void loadMembers() }, [loadMembers])

  const memberIds = useMemo(() => new Set(members.map((member) => member.user_id)), [members])
  const teamProfiles = useMemo(() => profiles.filter((profile) => profile.role !== 'client'), [profiles])
  const clientProfiles = useMemo(() => profiles.filter((profile) => profile.role === 'client'), [profiles])
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients])
  const activeAssignableEmployees = useMemo(
    () => profiles.filter((profile) => profile.role === 'employee' && profile.status === 'active'),
    [profiles],
  )

  const applyProfile = (updated: Profile | null, fallbackId: string) => {
    if (updated) setProfiles((items) => items.map((item) => (item.id === fallbackId ? updated : item)))
  }

  const changeRole = async (userId: string, role: AppRole) => {
    setError('')
    setMessage('')
    const result = await setProfileRole(userId, role)
    if (result.error) setError(result.error)
    else {
      applyProfile(result.data, userId)
      setMessage('Role updated.')
    }
  }

  const changeStatus = async (userId: string, status: ProfileStatus) => {
    setError('')
    setMessage('')
    const result = await setProfileStatus(userId, status)
    if (result.error) setError(result.error)
    else {
      applyProfile(result.data, userId)
      setMessage(status === 'active' ? 'Account activated.' : 'Account deactivated. The user immediately loses workspace access.')
    }
  }

  const changeEmployeeRole = async (userId: string, employeeRoleId: string) => {
    setError('')
    setMessage('')
    const result = await setProfileEmployeeRole(userId, employeeRoleId || null)
    if (result.error) setError(result.error)
    else {
      applyProfile(result.data, userId)
      setMessage('Job role updated.')
    }
  }

  const changeClientLink = async (userId: string, clientId: string) => {
    setError('')
    setMessage('')
    const result = await setProfileClientLink(userId, clientId || null)
    if (result.error) setError(result.error)
    else {
      applyProfile(result.data, userId)
      setMessage('Client record link updated.')
    }
  }

  const submitEmployeeRole = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!roleForm.name.trim()) return
    setSaving(true)
    setError('')
    const result = await createEmployeeRole({
      key: slugify(roleForm.name),
      name: roleForm.name.trim(),
      description: roleForm.description.trim() || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setRoleForm({ name: '', description: '' })
    setMessage('Job role created.')
    await load()
  }

  const startEditRole = (role: EmployeeRole) => {
    setEditingRoleId(role.id)
    setRoleEditForm({ name: role.name, description: role.description || '' })
  }

  const saveRoleEdit = async (roleId: string) => {
    setError('')
    const result = await updateEmployeeRole(roleId, {
      name: roleEditForm.name.trim(),
      description: roleEditForm.description.trim() || null,
    })
    if (result.error) setError(result.error)
    else {
      setEditingRoleId(null)
      setMessage('Job role updated.')
      await load()
    }
  }

  const toggleRoleActive = async (role: EmployeeRole) => {
    setError('')
    const result = await updateEmployeeRole(role.id, { is_active: !role.is_active })
    if (result.error) setError(result.error)
    else {
      setMessage(!role.is_active ? 'Job role enabled.' : 'Job role disabled. It can no longer be selected, but current assignments stay in place.')
      await load()
    }
  }

  const removeEmployeeRole = async (role: EmployeeRole) => {
    if (!window.confirm(`Delete the job role “${role.name}”? Employees assigned to it become unassigned.`)) return
    const result = await deleteEmployeeRole(role.id)
    if (result.error) setError(result.error)
    else {
      setMessage('Job role deleted.')
      await load()
    }
  }

  const submitProject = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await createProject({
      ...projectForm,
      description: projectForm.description || null,
      due_date: projectForm.due_date || null,
      budget: projectForm.budget ? Number(projectForm.budget) : null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setProjectModalOpen(false)
    setProjectForm(emptyProjectForm)
    setMessage('Project created.')
    await load()
  }

  const removeProject = async (project: ProjectWithClient) => {
    if (!window.confirm(`Delete “${project.name}”? This also deletes its assignments, tasks, and project files.`)) return
    const result = await deleteProject(project.id)
    if (result.error) setError(result.error)
    else {
      setMessage('Project deleted.')
      await load()
    }
  }

  const toggleAssignment = async (userId: string) => {
    setError('')
    const result = memberIds.has(userId)
      ? await removeProjectMember(selectedProjectId, userId)
      : await addProjectMember(selectedProjectId, userId)
    if (result.error) setError(result.error)
    else await loadMembers()
  }

  if (!isAdmin) {
    return <Page><PageHeader eyebrow="ADMIN / ACCESS CONTROL" title="Administration" description="This area is restricted to workspace administrators." /><Panel><EmptyState icon={ShieldCheck} title="Administrator access required" description="Your current role cannot manage users, permissions, or projects." /></Panel></Page>
  }

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / ACCESS CONTROL"
        title="Administration"
        description="Manage team members, job roles, client accounts, projects, and employee assignments."
        action={tab === 'projects' ? <button className={primaryButtonClassName} onClick={() => setProjectModalOpen(true)} disabled={!clients.length}><Plus className="h-4 w-4" /> New project</button> : undefined}
      />

      <div className="flex flex-wrap gap-2">
        {([['team', Users, 'Team members'], ['roles', Briefcase, 'Job roles'], ['permissions', KeyRound, 'Roles & permissions'], ['clients', UserRound, 'Client accounts'], ['projects', FolderKanban, 'Projects'], ['access', UserCog, 'Assignments']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? primaryButtonClassName : secondaryButtonClassName}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      {loading ? <Panel><LoadingState label="Loading administration…" /></Panel> : (
        <>
          {tab === 'permissions' && <RolesPermissionsAdmin />}
          {tab === 'team' && (
            <Panel title="Team members" description="Staff accounts only. New sign-ups receive Employee access unless their e-mail matches a submitted service request — those become client accounts instead.">
              {teamProfiles.length === 0 ? <EmptyState icon={Users} title="No team members found" description="Authenticated staff accounts will appear here after the database migration has been applied." /> : (
                <div className="divide-y divide-border">
                  {teamProfiles.map((profile) => (
                    <div key={profile.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{profile.full_name || 'Unnamed user'}</p>
                        <p className="mt-1 truncate text-xs text-text-tertiary">{profile.email}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[560px]">
                        <select aria-label={`System role for ${profile.email}`} value={profile.role} onChange={(event) => void changeRole(profile.id, event.target.value as AppRole)} className={inputClassName}>
                          {systemRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                        </select>
                        {profile.role === 'employee' ? (
                          <select aria-label={`Job role for ${profile.email}`} value={profile.employee_role_id || ''} onChange={(event) => void changeEmployeeRole(profile.id, event.target.value)} className={inputClassName}>
                            <option value="">No job role</option>
                            {employeeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.is_active ? '' : ' (disabled)'}</option>)}
                          </select>
                        ) : <span className="hidden sm:block" />}
                        <select aria-label={`Status for ${profile.email}`} value={profile.status} onChange={(event) => void changeStatus(profile.id, event.target.value as ProfileStatus)} className={inputClassName} disabled={profile.id === user?.id && profile.role === 'admin'}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {tab === 'roles' && (
            <Panel title="Job roles" description="Define the roles your employees work in, such as Designer, Translator, Copywriter, Developer, or Project Manager. Nothing is hardcoded — create what you need.">
              <form onSubmit={submitEmployeeRole} className="grid gap-3 border-b border-border p-5 sm:grid-cols-[1fr_2fr_auto]">
                <input required placeholder="Role name (e.g. Designer)" className={inputClassName} value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} />
                <input placeholder="Description (optional)" className={inputClassName} value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
                <button className={primaryButtonClassName} disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add role</button>
              </form>
              {employeeRoles.length === 0 ? <EmptyState icon={Briefcase} title="No job roles yet" description="Create the first role above, then assign it to employees from the Team members tab." /> : (
                <div className="divide-y divide-border">
                  {employeeRoles.map((role) => (
                    <div key={role.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                      {editingRoleId === role.id ? (
                        <div className="grid flex-1 gap-2 sm:grid-cols-2">
                          <input aria-label="Role name" className={inputClassName} value={roleEditForm.name} onChange={(event) => setRoleEditForm({ ...roleEditForm, name: event.target.value })} />
                          <input aria-label="Role description" className={inputClassName} value={roleEditForm.description} onChange={(event) => setRoleEditForm({ ...roleEditForm, description: event.target.value })} placeholder="Description (optional)" />
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-fg">{role.name}</p>
                            <span className="rounded border border-border px-1.5 py-0.5 font-mono-tech text-[9px] text-text-tertiary">{role.key}</span>
                            {!role.is_active && <span className="rounded border border-red-500/30 bg-red-500/5 px-1.5 py-0.5 text-[10px] text-red-400">disabled</span>}
                          </div>
                          {role.description && <p className="mt-1 truncate text-xs text-text-tertiary">{role.description}</p>}
                        </div>
                      )}
                      <div className="flex shrink-0 items-center gap-2">
                        {editingRoleId === role.id ? (
                          <>
                            <button onClick={() => void saveRoleEdit(role.id)} className={primaryButtonClassName}>Save</button>
                            <button onClick={() => setEditingRoleId(null)} className={secondaryButtonClassName}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditRole(role)} className="rounded-md border border-border p-2 text-text-tertiary hover:text-fg" aria-label={`Edit ${role.name}`}><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => void toggleRoleActive(role)} className={secondaryButtonClassName}>{role.is_active ? 'Disable' : 'Enable'}</button>
                            <button onClick={() => void removeEmployeeRole(role)} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${role.name}`}><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {tab === 'clients' && (
            <Panel title="Client accounts" description="People who submitted a service request and later signed in with the same e-mail automatically become client accounts linked to their CRM record. Clients never appear in team lists and never receive staff access.">
              {clientProfiles.length === 0 ? <EmptyState icon={UserRound} title="No client accounts" description="A client account is created automatically when a form submitter creates a login with the same e-mail address used on their request." /> : (
                <div className="divide-y divide-border">
                  {clientProfiles.map((profile) => (
                    <div key={profile.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{profile.full_name || 'Unnamed client'}</p>
                        <p className="mt-1 truncate text-xs text-text-tertiary">{profile.email}{profile.client_id && clientNames.get(profile.client_id) ? ` · ${clientNames.get(profile.client_id)}` : ''}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[420px]">
                        <select aria-label={`Linked client record for ${profile.email}`} value={profile.client_id || ''} onChange={(event) => void changeClientLink(profile.id, event.target.value)} className={inputClassName}>
                          <option value="">Not linked to a record</option>
                          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                        <select aria-label={`Status for ${profile.email}`} value={profile.status} onChange={(event) => void changeStatus(profile.id, event.target.value as ProfileStatus)} className={inputClassName}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {tab === 'projects' && (
            <Panel title="All projects" description="Admins and managers can manage projects. Employees only receive projects assigned to them. Clients never see projects unless linked later through the portal.">
              {!clients.length && <div className="border-b border-border p-5"><InlineAlert tone="info">Create a client from the Clients page before creating a project.</InlineAlert></div>}
              {projects.length === 0 ? <EmptyState icon={FolderKanban} title="No projects yet" description="Create the first project after at least one client exists." /> : (
                <div className="divide-y divide-border">
                  {projects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{project.name}</p><p className="mt-1 text-xs text-text-tertiary">{project.clients?.name || 'No client'} · {project.status} · {project.progress}%</p></div>
                      <button onClick={() => void removeProject(project)} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${project.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {tab === 'access' && (
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              <Panel title="Select project"><div className="p-5"><select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className={inputClassName}><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div></Panel>
              <Panel title="Employee access" description="Only active employees can be assigned. A checked employee can see this project. RLS enforces this rule in the database — inactive employees and client accounts lose access entirely.">
                {!selectedProjectId ? <EmptyState icon={FolderKanban} title="Choose a project" description="Select a project to manage its employee assignments." /> : activeAssignableEmployees.length === 0 ? <EmptyState icon={Users} title="No active employees" description="Change a workspace user to an active Employee to manage assignments." /> : (
                  <div className="divide-y divide-border">{activeAssignableEmployees.map((profile) => <label key={profile.id} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised"><span><span className="block text-sm font-medium">{profile.full_name || 'Unnamed user'}</span><span className="mt-1 block text-xs text-text-tertiary">{profile.email}{profile.employee_role_id ? ` · ${employeeRoles.find((role) => role.id === profile.employee_role_id)?.name || 'Job role'}` : ''}</span></span><input type="checkbox" checked={memberIds.has(profile.id)} onChange={() => void toggleAssignment(profile.id)} className="h-4 w-4 accent-[hsl(var(--accent))]" /></label>)}</div>
                )}
              </Panel>
            </div>
          )}
        </>
      )}

      <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title="Create project" description="The project becomes visible to employees only after assignment.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitProject}>
          <label className="text-xs text-text-secondary sm:col-span-2">Project name<input required className={`${inputClassName} mt-2`} value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Client<select required className={`${inputClassName} mt-2`} value={projectForm.client_id} onChange={(event) => setProjectForm({ ...projectForm, client_id: event.target.value })}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Type<input required className={`${inputClassName} mt-2`} value={projectForm.type} onChange={(event) => setProjectForm({ ...projectForm, type: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Status<select className={`${inputClassName} mt-2`} value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as ProjectStatus })}><option value="active">Active</option><option value="review">In review</option><option value="on-hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
          <label className="text-xs text-text-secondary">Due date<input type="date" className={`${inputClassName} mt-2`} value={projectForm.due_date} onChange={(event) => setProjectForm({ ...projectForm, due_date: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Budget<input type="number" min="0" className={`${inputClassName} mt-2`} value={projectForm.budget} onChange={(event) => setProjectForm({ ...projectForm, budget: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Currency<input className={`${inputClassName} mt-2`} value={projectForm.currency} onChange={(event) => setProjectForm({ ...projectForm, currency: event.target.value.toUpperCase() })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-24`} value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} /></label>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={secondaryButtonClassName} onClick={() => setProjectModalOpen(false)}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Create project</button></div>
        </form>
      </Modal>
    </Page>
  )
}
