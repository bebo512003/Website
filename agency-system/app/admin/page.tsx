'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderKanban, LoaderCircle, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  addProjectMember,
  createProject,
  deleteProject,
  getClients,
  getProfiles,
  getProjectMembers,
  getProjects,
  removeProjectMember,
  setProfileRole,
} from '@/lib/supabase/database'
import type { AppRole, Client, Profile, ProjectMember, ProjectStatus, ProjectWithClient } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type Tab = 'users' | 'projects' | 'access'
type MemberWithProfile = ProjectMember & { profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null }

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

export default function AdminPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('users')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectForm, setProjectForm] = useState(emptyProjectForm)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
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
    const [profileResult, projectResult, clientResult] = await Promise.all([getProfiles(), getProjects(), getClients()])
    setProfiles(profileResult.data)
    setProjects(projectResult.data)
    setClients(clientResult.data)
    setError(profileResult.error || projectResult.error || clientResult.error || '')
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

  const changeRole = async (userId: string, role: AppRole) => {
    setError('')
    setMessage('')
    const result = await setProfileRole(userId, role)
    if (result.error) setError(result.error)
    else {
      setProfiles((items) => items.map((item) => item.id === userId && result.data ? result.data : item))
      setMessage('Role updated.')
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
        description="Manage real workspace accounts, role permissions, projects, and employee assignments."
        action={tab === 'projects' ? <button className={primaryButtonClassName} onClick={() => setProjectModalOpen(true)} disabled={!clients.length}><Plus className="h-4 w-4" /> New project</button> : undefined}
      />

      <div className="flex flex-wrap gap-2">
        {([['users', Users, 'Users & roles'], ['projects', FolderKanban, 'Projects'], ['access', ShieldCheck, 'Assignments']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? primaryButtonClassName : secondaryButtonClassName}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      {loading ? <Panel><LoadingState label="Loading administration…" /></Panel> : (
        <>
          {tab === 'users' && (
            <Panel title="Workspace users" description="New sign-ups receive Employee access. Only an administrator can change roles.">
              {profiles.length === 0 ? <EmptyState icon={Users} title="No users found" description="Authenticated accounts will appear here after the database migration has been applied." /> : (
                <div className="divide-y divide-border">
                  {profiles.map((profile) => (
                    <div key={profile.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{profile.full_name || 'Unnamed user'}</p><p className="mt-1 truncate text-xs text-text-tertiary">{profile.email}</p></div>
                      <select aria-label={`Role for ${profile.email}`} value={profile.role} onChange={(event) => void changeRole(profile.id, event.target.value as AppRole)} className={`${inputClassName} w-full sm:w-40`}>
                        <option value="admin">Admin</option><option value="manager">Manager</option><option value="employee">Employee</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {tab === 'projects' && (
            <Panel title="All projects" description="Admins and managers can manage projects. Employees only receive projects assigned to them.">
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
              <Panel title="Employee access" description="A checked employee can see this project. RLS enforces this rule in the database.">
                {!selectedProjectId ? <EmptyState icon={FolderKanban} title="Choose a project" description="Select a project to manage its employee assignments." /> : profiles.filter((profile) => profile.role === 'employee').length === 0 ? <EmptyState icon={Users} title="No employees" description="Change a workspace user to Employee to manage assignments." /> : (
                  <div className="divide-y divide-border">{profiles.filter((profile) => profile.role === 'employee').map((profile) => <label key={profile.id} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised"><span><span className="block text-sm font-medium">{profile.full_name || 'Unnamed user'}</span><span className="mt-1 block text-xs text-text-tertiary">{profile.email}</span></span><input type="checkbox" checked={memberIds.has(profile.id)} onChange={() => void toggleAssignment(profile.id)} className="h-4 w-4 accent-[hsl(var(--accent))]" /></label>)}</div>
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
