'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckSquare, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createTask, deleteTask, getProjects, getTasks, updateTask } from '@/lib/supabase/database'
import type { Profile, ProjectWithClient, TaskPriority, TaskStatus, TaskWithRelations } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

const columns: { id: TaskStatus; label: string }[] = [{ id: 'todo', label: 'To do' }, { id: 'inprogress', label: 'In progress' }, { id: 'review', label: 'Review' }, { id: 'done', label: 'Done' }]

export default function TasksPage() {
  const { user, profile, isManager } = useAuth()
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', project_id: '', priority: 'medium' as TaskPriority, assignee_id: '', due_date: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [taskResult, projectResult] = await Promise.all([getTasks(), getProjects()])
    setTasks(taskResult.data); setProjects(projectResult.data); setProfiles(profile ? [profile] : []); setError(taskResult.error || projectResult.error || ''); setLoading(false)
  }, [profile])
  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => Object.fromEntries(columns.map((column) => [column.id, tasks.filter((task) => task.status === column.id)])) as Record<TaskStatus, TaskWithRelations[]>, [tasks])

  const openCreate = () => {
    setForm({ title: '', description: '', project_id: projects[0]?.id || '', priority: 'medium', assignee_id: user?.id || '', due_date: '' })
    setModal(true)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    const result = await createTask({ title: form.title.trim(), description: form.description.trim() || null, project_id: form.project_id, priority: form.priority, assignee_id: form.assignee_id || null, due_date: form.due_date || null })
    setSaving(false)
    if (result.error) setError(result.error)
    else { setModal(false); await load() }
  }

  const move = async (task: TaskWithRelations, status: TaskStatus) => {
    const result = await updateTask(task.id, { status, completed_date: status === 'done' ? new Date().toISOString().slice(0, 10) : null })
    if (result.error) setError(result.error); else await load()
  }

  const remove = async (task: TaskWithRelations) => {
    if (!window.confirm(`Delete “${task.title}”?`)) return
    const result = await deleteTask(task.id)
    if (result.error) setError(result.error); else await load()
  }

  return <Page><PageHeader eyebrow="TASKS / BOARD" title="Tasks" description="This board contains tasks from projects your account is authorized to access." action={<button className={primaryButtonClassName} onClick={openCreate} disabled={!projects.length}><Plus className="h-4 w-4" />New task</button>} />{error && <InlineAlert>{error}</InlineAlert>}{loading ? <Panel><LoadingState label="Loading tasks…" /></Panel> : !projects.length ? <Panel><EmptyState icon={CheckSquare} title="No accessible projects" description={isManager ? 'Create a project before adding tasks.' : 'A manager must assign a project to your account.'} /></Panel> : tasks.length === 0 ? <Panel><EmptyState icon={CheckSquare} title="No tasks yet" description="Create the first task for an accessible project." action={<button className={primaryButtonClassName} onClick={openCreate}><Plus className="h-4 w-4" />New task</button>} /></Panel> : <div className="grid gap-4 xl:grid-cols-4">{columns.map((column) => <Panel key={column.id} title={`${column.label} · ${grouped[column.id].length}`}><div className="space-y-3 p-3">{grouped[column.id].length === 0 ? <p className="p-4 text-center text-xs text-text-tertiary">No tasks</p> : grouped[column.id].map((task) => <article key={task.id} className="rounded-md border border-border bg-surface-raised p-4"><div className="flex items-start justify-between gap-2"><Link href={`/projects/${task.project_id}`} className="text-sm font-semibold hover:text-accent">{task.title}</Link>{(isManager || task.created_by === user?.id) && <button onClick={() => void remove(task)} className="text-text-tertiary hover:text-red-400" aria-label={`Delete ${task.title}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div><p className="mt-2 text-xs text-text-tertiary">{task.projects?.name || 'Project unavailable'}</p><p className="mt-1 text-xs text-text-tertiary">{task.profiles?.full_name || task.profiles?.email || 'Unassigned'} · {task.priority}</p><select className={`${inputClassName} mt-4 py-2 text-xs`} value={task.status} onChange={(event) => void move(task, event.target.value as TaskStatus)} aria-label={`Move ${task.title}`}>{columns.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></article>)}</div></Panel>)}</div>}

  <Modal open={modal} onClose={() => setModal(false)} title="Create task" description="The task will inherit the selected project's access controls."><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-text-secondary sm:col-span-2">Title<input required className={`${inputClassName} mt-2`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="text-xs text-text-secondary">Project<select required className={`${inputClassName} mt-2`} value={form.project_id} onChange={(event) => setForm({ ...form, project_id: event.target.value })}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="text-xs text-text-secondary">Assignee<select className={`${inputClassName} mt-2`} value={form.assignee_id} onChange={(event) => setForm({ ...form, assignee_id: event.target.value })}><option value="">Unassigned</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label><label className="text-xs text-text-secondary">Priority<select className={`${inputClassName} mt-2`} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="text-xs text-text-secondary">Due date<input type="date" className={`${inputClassName} mt-2`} value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label><label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-24`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(false)} className={secondaryButtonClassName}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Create task</button></div></form></Modal></Page>
}
