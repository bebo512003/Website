'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, CheckCircle2, Clock, FolderKanban, LoaderCircle, Plus, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createTask, deleteTask, getProjectById, getProjectMembers, getTasksByProjectId, updateProject, updateTask } from '@/lib/supabase/database'
import type { Profile, ProjectMember, ProjectStatus, ProjectWithClient, TaskPriority, TaskStatus, TaskWithRelations } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type Member = ProjectMember & { profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null }
const taskStatuses: TaskStatus[] = ['todo', 'inprogress', 'review', 'done']
const taskStatusLabels: Record<TaskStatus, string> = { todo: 'To do', inprogress: 'In progress', review: 'Review', done: 'Done' }
const projectStatusLabels: Record<ProjectStatus, string> = { active: 'Active', review: 'In review', completed: 'Completed', 'on-hold': 'On hold', cancelled: 'Cancelled' }

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user, profile, isManager } = useAuth()
  const [project, setProject] = useState<ProjectWithClient | null>(null)
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [taskModal, setTaskModal] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, assignee_id: '', due_date: '' })
  const [projectForm, setProjectForm] = useState({ status: 'active' as ProjectStatus, progress: '0', phase: '1', phase_name: '', due_date: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [projectResult, tasksResult, membersResult] = await Promise.all([getProjectById(id), getTasksByProjectId(id), getProjectMembers(id)])
    setProject(projectResult.data)
    setTasks(tasksResult.data)
    setMembers(membersResult.data)
    if (projectResult.data) setProjectForm({ status: projectResult.data.status, progress: String(projectResult.data.progress), phase: String(projectResult.data.phase), phase_name: projectResult.data.phase_name || '', due_date: projectResult.data.due_date || '' })
    setError(projectResult.error || tasksResult.error || membersResult.error || '')
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  const assignees = useMemo(() => {
    const list = members.map((member) => member.profiles).filter((item): item is NonNullable<typeof item> => Boolean(item))
    if (profile && !list.some((item) => item.id === profile.id)) list.push(profile)
    return list
  }, [members, profile])

  const openTask = () => {
    setTaskForm({ title: '', description: '', priority: 'medium', assignee_id: user?.id || '', due_date: '' })
    setTaskModal(true)
  }

  const submitTask = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const result = await createTask({
      title: taskForm.title.trim(), description: taskForm.description.trim() || null, project_id: id,
      priority: taskForm.priority, assignee_id: taskForm.assignee_id || null, due_date: taskForm.due_date || null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    else { setTaskModal(false); setMessage('Task created.'); await load() }
  }

  const moveTask = async (task: TaskWithRelations, status: TaskStatus) => {
    const result = await updateTask(task.id, { status, completed_date: status === 'done' ? new Date().toISOString().slice(0, 10) : null })
    if (result.error) setError(result.error)
    else await load()
  }

  const removeTask = async (task: TaskWithRelations) => {
    if (!window.confirm(`Delete “${task.title}”?`)) return
    const result = await deleteTask(task.id)
    if (result.error) setError(result.error)
    else await load()
  }

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const result = await updateProject(id, {
      status: projectForm.status, progress: Number(projectForm.progress), phase: Number(projectForm.phase),
      phase_name: projectForm.phase_name.trim() || null, due_date: projectForm.due_date || null,
      completed_date: projectForm.status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    else { setMessage('Project progress updated.'); await load() }
  }

  if (loading) return <Page><PageHeader eyebrow="PROJECTS / DETAIL" title="Project" /><Panel><LoadingState label="Loading project…" /></Panel></Page>
  if (!project) return <Page><PageHeader eyebrow="PROJECTS / DETAIL" title="Project" /><InlineAlert>{error || 'This project does not exist or your account is not assigned to it.'}</InlineAlert><Link href="/projects" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to projects</Link></Page>

  return (
    <Page>
      <div><Link href="/projects" className="inline-flex items-center gap-2 text-xs text-text-tertiary hover:text-accent"><ArrowLeft className="h-3.5 w-3.5" /> Back to projects</Link></div>
      <PageHeader eyebrow={`PROJECT / ${project.type.toUpperCase()}`} title={project.name} description={project.description || 'No description provided.'} action={<button className={primaryButtonClassName} onClick={openTask}><Plus className="h-4 w-4" /> New task</button>} />
      {error && <InlineAlert>{error}</InlineAlert>}{message && <InlineAlert tone="success">{message}</InlineAlert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-5"><Users className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Client</p><p className="mt-1 text-sm font-semibold">{project.clients?.name || 'Unavailable'}</p></Panel>
        <Panel className="p-5"><Calendar className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Due date</p><p className="mt-1 text-sm font-semibold">{project.due_date ? new Date(`${project.due_date}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'Not set'}</p></Panel>
        <Panel className="p-5"><CheckCircle2 className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Status</p><p className="mt-1 text-sm font-semibold">{projectStatusLabels[project.status]}</p></Panel>
        <Panel className="p-5"><Clock className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Current phase</p><p className="mt-1 text-sm font-semibold">{project.phase}/10 {project.phase_name && `· ${project.phase_name}`}</p></Panel>
      </div>

      <Panel title="Overall progress" description={`${project.progress}% complete`}><div className="p-5"><div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${project.progress}%` }} /></div></div></Panel>

      {isManager && <Panel title="Manage progress" description="Saving a status or progress change notifies assigned employees."><form onSubmit={saveProject} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs text-text-secondary">Status<select className={`${inputClassName} mt-2`} value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as ProjectStatus })}>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs text-text-secondary">Progress<input type="number" min="0" max="100" className={`${inputClassName} mt-2`} value={projectForm.progress} onChange={(event) => setProjectForm({ ...projectForm, progress: event.target.value })} /></label><label className="text-xs text-text-secondary">Phase<input type="number" min="1" max="10" className={`${inputClassName} mt-2`} value={projectForm.phase} onChange={(event) => setProjectForm({ ...projectForm, phase: event.target.value })} /></label><label className="text-xs text-text-secondary">Phase name<input className={`${inputClassName} mt-2`} value={projectForm.phase_name} onChange={(event) => setProjectForm({ ...projectForm, phase_name: event.target.value })} /></label><label className="text-xs text-text-secondary">Due date<input type="date" className={`${inputClassName} mt-2`} value={projectForm.due_date} onChange={(event) => setProjectForm({ ...projectForm, due_date: event.target.value })} /></label><div className="lg:col-span-5"><button className={primaryButtonClassName} disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Save progress</button></div></form></Panel>}

      <Panel title="Tasks" description={`${tasks.length} task${tasks.length === 1 ? '' : 's'} in this project`}>
        {tasks.length === 0 ? <EmptyState icon={FolderKanban} title="No tasks yet" description="Create the first task for this project." action={<button className={primaryButtonClassName} onClick={openTask}><Plus className="h-4 w-4" /> New task</button>} /> : <div className="divide-y divide-border">{tasks.map((task) => <div key={task.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{task.title}</p><span className="rounded border border-border px-2 py-0.5 text-[10px] text-text-tertiary">{task.priority}</span></div><p className="mt-1 text-xs text-text-tertiary">{task.profiles?.full_name || task.profiles?.email || 'Unassigned'}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}` : ''}</p></div><select aria-label={`Status for ${task.title}`} className={`${inputClassName} lg:w-40`} value={task.status} onChange={(event) => void moveTask(task, event.target.value as TaskStatus)}>{taskStatuses.map((value) => <option value={value} key={value}>{taskStatusLabels[value]}</option>)}</select>{(isManager || task.created_by === user?.id) && <button onClick={() => void removeTask(task)} className="rounded-md border border-border p-2 text-text-tertiary hover:text-red-400" aria-label={`Delete ${task.title}`}><Trash2 className="h-4 w-4" /></button>}</div>)}</div>}
      </Panel>

      <Modal open={taskModal} onClose={() => setTaskModal(false)} title="Create task" description="The task is saved to this project in Supabase."><form className="grid gap-4 sm:grid-cols-2" onSubmit={submitTask}><label className="text-xs text-text-secondary sm:col-span-2">Title<input required className={`${inputClassName} mt-2`} value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} /></label><label className="text-xs text-text-secondary">Assignee<select className={`${inputClassName} mt-2`} value={taskForm.assignee_id} onChange={(event) => setTaskForm({ ...taskForm, assignee_id: event.target.value })}><option value="">Unassigned</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.full_name || assignee.email}</option>)}</select></label><label className="text-xs text-text-secondary">Priority<select className={`${inputClassName} mt-2`} value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as TaskPriority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="text-xs text-text-secondary">Due date<input type="date" className={`${inputClassName} mt-2`} value={taskForm.due_date} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} /></label><label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-24`} value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setTaskModal(false)} className={secondaryButtonClassName}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Create task</button></div></form></Modal>
    </Page>
  )
}
