'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, CheckCircle2, ChevronRight, FileInput, Flag, FolderKanban, HeartPulse, LoaderCircle, Plus, Trash2, UserRound, Users, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { addProjectMember, deleteTask, getProfiles, getProjectById, getProjectMembers, getTasksByProjectId, removeProjectMember, updateProject, updateTask } from '@/lib/supabase/database'
import type { Profile, ProjectHealth, ProjectMember, ProjectPriority, ProjectStatus, ProjectWithClient, TaskStatus, TaskWithRelations } from '@/lib/supabase/types'
import {
  PROJECT_FLOW, PROJECT_HEALTH_LABELS, PROJECT_HEALTH_ORDER, PROJECT_STATUS_LABELS,
  nextProjectStatuses, projectHealthBadgeClass, projectStatusBadgeClass,
} from '@/lib/project-lifecycle'
import {
  TASK_PRIORITY_LABELS, formatTaskDueDate, taskDueBadgeClass, taskPriorityBadgeClass,
} from '@/lib/tasks'
import { CreateTaskModal } from '@/components/tasks/create-task-modal'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { ProjectActivityTimeline } from '@/components/projects/project-activity-timeline'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type Member = ProjectMember & { profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null }
const taskStatuses: TaskStatus[] = ['todo', 'inprogress', 'review', 'done']
const taskStatusLabels: Record<TaskStatus, string> = { todo: 'To do', inprogress: 'In progress', review: 'Review', done: 'Done' }
const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user, can } = useAuth()
  const [project, setProject] = useState<ProjectWithClient | null>(null)
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [taskModal, setTaskModal] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [addMemberId, setAddMemberId] = useState('')
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [projectForm, setProjectForm] = useState({
    health: 'on-track' as ProjectHealth, priority: 'medium' as ProjectPriority,
    progress: '0', phase: '1', phase_name: '', due_date: '', owner_id: '', manager_id: '',
  })
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null)
  const [activityKey, setActivityKey] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const t = sp.get('task')
      if (t) setHighlightTaskId(t)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [projectResult, tasksResult, membersResult, teamResult] = await Promise.all([
      getProjectById(id), getTasksByProjectId(id), getProjectMembers(id), getProfiles(),
    ])
    setProject(projectResult.data)
    setTasks(tasksResult.data)
    setMembers(membersResult.data)
    setTeam(teamResult.data)
    if (projectResult.data) {
      const p = projectResult.data
      setProjectForm({
        health: p.health, priority: p.priority,
        progress: String(p.progress), phase: String(p.phase), phase_name: p.phase_name || '',
        due_date: p.due_date || '', owner_id: p.owner_id || '', manager_id: p.manager_id || '',
      })
    }
    setError(projectResult.error || tasksResult.error || membersResult.error || teamResult.error || '')
    setLoading(false)
    setActivityKey((key) => key + 1)
  }, [id])

  useEffect(() => { void load() }, [load])

  const activeTeam = useMemo(
    () => team.filter((member) => member.status === 'active' && member.role !== 'client'),
    [team]
  )

  const addableMembers = useMemo(() => {
    const existing = new Set(members.map((member) => member.user_id))
    return activeTeam.filter((member) => !existing.has(member.id))
  }, [activeTeam, members])

  const nextStatuses = useMemo(() => (project ? nextProjectStatuses(project.status) : []), [project])

  const detailTask = detailTaskId ? (tasks.find((task) => task.id === detailTaskId) ?? null) : null

  const openTask = () => {
    setTaskModal(true)
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
    setError('')
    const result = await updateProject(id, {
      health: projectForm.health,
      priority: projectForm.priority,
      progress: Number(projectForm.progress),
      phase: Number(projectForm.phase),
      phase_name: projectForm.phase_name.trim() || null,
      due_date: projectForm.due_date || null,
      owner_id: projectForm.owner_id || null,
      manager_id: projectForm.manager_id || null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    else { setMessage('Project updated.'); await load() }
  }

  const changeStatus = async (status: ProjectStatus) => {
    setSaving(true)
    setError('')
    const result = await updateProject(id, { status })
    setSaving(false)
    if (result.error) setError(result.error)
    else { setMessage(`Status moved to ${PROJECT_STATUS_LABELS[status]}.`); await load() }
  }

  const addMember = async () => {
    if (!addMemberId) return
    setError('')
    const result = await addProjectMember(id, addMemberId)
    if (result.error) setError(result.error)
    else { setAddMemberId(''); setMessage('Team member added.'); await load() }
  }

  const removeMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.profiles?.full_name || member.profiles?.email || 'this member'} from the team?`)) return
    setError('')
    const result = await removeProjectMember(id, member.user_id)
    if (result.error) setError(result.error)
    else { setMessage('Team member removed.'); await load() }
  }

  const isLead = (member: Member) => project != null && (member.user_id === project.owner_id || member.user_id === project.manager_id)

  if (loading) return <Page><PageHeader eyebrow="PROJECTS / DETAIL" title="Project" /><Panel><LoadingState label="Loading project…" /></Panel></Page>
  if (!project) return <Page><PageHeader eyebrow="PROJECTS / DETAIL" title="Project" /><InlineAlert>{error || 'This project does not exist or your account is not assigned to it.'}</InlineAlert><Link href="/projects" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to projects</Link></Page>

  return (
    <Page>
      <div><Link href="/projects" className="inline-flex items-center gap-2 text-xs text-text-tertiary hover:text-accent"><ArrowLeft className="h-3.5 w-3.5" /> Back to projects</Link></div>
      <PageHeader eyebrow={`PROJECT / ${project.type.toUpperCase()}`} title={project.name} description={project.description || 'No description provided.'} action={can('task.create') ? <button className={primaryButtonClassName} onClick={openTask}><Plus className="h-4 w-4" /> New task</button> : undefined} />
      {error && <InlineAlert>{error}</InlineAlert>}{message && <InlineAlert tone="success">{message}</InlineAlert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Panel className="p-5"><Users className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Client</p><p className="mt-1 text-sm font-semibold">{project.clients?.name || 'Unavailable'}</p></Panel>
        <Panel className="p-5"><Calendar className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Deadline</p><p className="mt-1 text-sm font-semibold">{project.due_date ? new Date(`${project.due_date}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'Not set'}</p></Panel>
        <Panel className="p-5"><CheckCircle2 className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Status</p><span className={`mt-2 inline-block rounded border px-2 py-1 text-sm font-semibold ${projectStatusBadgeClass(project.status)}`}>{PROJECT_STATUS_LABELS[project.status]}</span></Panel>
        <Panel className="p-5"><HeartPulse className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Health</p><span className={`mt-2 inline-block rounded border px-2 py-1 text-sm font-semibold ${projectHealthBadgeClass(project.health)}`}>{PROJECT_HEALTH_LABELS[project.health]}</span></Panel>
        <Panel className="p-5"><Flag className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Priority</p><p className="mt-1 text-sm font-semibold capitalize">{PRIORITY_LABELS[project.priority]}</p></Panel>
        <Panel className="p-5"><UserRound className="h-4 w-4 text-accent" /><p className="mt-4 text-xs text-text-tertiary">Owner / Manager</p><p className="mt-1 text-sm font-semibold">{project.owner?.full_name || project.owner?.email || 'No owner'}</p><p className="mt-1 text-xs text-text-tertiary">{project.manager?.full_name || project.manager?.email || 'No separate manager'}</p></Panel>
      </div>

      <Panel title="Lifecycle" description="The ordered stages this project moves through. Only the highlighted next steps are valid transitions.">
        <div className="flex flex-wrap items-center gap-2 p-5">
          {PROJECT_FLOW.map((status, index) => {
            const isCurrent = project.status === status
            const isDone = PROJECT_FLOW.indexOf(project.status) > index
            const isNext = nextStatuses.includes(status)
            return (
              <div key={status} className="flex items-center gap-2">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" />}
                <span className={`rounded-full border px-3 py-1 text-xs ${isCurrent ? 'border-accent bg-accent/15 font-semibold text-accent' : isDone ? 'border-emerald-500/30 text-emerald-300' : isNext ? 'border-amber-500/30 text-amber-300' : 'border-border text-text-tertiary'}`}>
                  {PROJECT_STATUS_LABELS[status]}
                </span>
              </div>
            )
          })}
          {(project.status === 'on-hold' || project.status === 'cancelled') && (
            <span className={`rounded-full border px-3 py-1 text-xs ${projectStatusBadgeClass(project.status)}`}>{PROJECT_STATUS_LABELS[project.status]} state</span>
          )}
        </div>
      </Panel>

      {can('project.edit') && (
        <Panel title="Change status" description="Move this project to its next valid stage. Invalid jumps are rejected by the database.">
          <div className="flex flex-wrap gap-2 p-5">
            {nextStatuses.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                {project.status === 'completed' ? 'Completed is a terminal state. No further transitions are available.' : 'This project has no further transitions.'}
              </p>
            ) : nextStatuses.map((status) => (
              <button key={status} className={secondaryButtonClassName} onClick={() => void changeStatus(status)} disabled={saving}>
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{PROJECT_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Overall progress" description={`${project.progress}% complete`}><div className="p-5"><div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${project.progress}%` }} /></div></div></Panel>

      {can('project.edit') && <Panel title="Manage project" description="Ownership, health, and scheduling changes notify assigned employees."><form onSubmit={saveProject} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-text-secondary">Owner<select className={`${inputClassName} mt-2`} value={projectForm.owner_id} onChange={(event) => setProjectForm({ ...projectForm, owner_id: event.target.value })}><option value="">No owner</option>{activeTeam.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}</select></label>
        <label className="text-xs text-text-secondary">Manager<select className={`${inputClassName} mt-2`} value={projectForm.manager_id} onChange={(event) => setProjectForm({ ...projectForm, manager_id: event.target.value })}><option value="">No separate manager</option>{activeTeam.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}</select></label>
        <label className="text-xs text-text-secondary">Priority<select className={`${inputClassName} mt-2`} value={projectForm.priority} onChange={(event) => setProjectForm({ ...projectForm, priority: event.target.value as ProjectPriority })}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs text-text-secondary">Health<select className={`${inputClassName} mt-2`} value={projectForm.health} onChange={(event) => setProjectForm({ ...projectForm, health: event.target.value as ProjectHealth })}>{PROJECT_HEALTH_ORDER.map((value) => <option key={value} value={value}>{PROJECT_HEALTH_LABELS[value]}</option>)}</select></label>
        <label className="text-xs text-text-secondary">Progress (%)<input type="number" min="0" max="100" className={`${inputClassName} mt-2`} value={projectForm.progress} onChange={(event) => setProjectForm({ ...projectForm, progress: event.target.value })} /></label>
        <label className="text-xs text-text-secondary">Phase (1–10)<input type="number" min="1" max="10" className={`${inputClassName} mt-2`} value={projectForm.phase} onChange={(event) => setProjectForm({ ...projectForm, phase: event.target.value })} /></label>
        <label className="text-xs text-text-secondary">Phase name<input className={`${inputClassName} mt-2`} value={projectForm.phase_name} onChange={(event) => setProjectForm({ ...projectForm, phase_name: event.target.value })} /></label>
        <label className="text-xs text-text-secondary">Deadline<input type="date" className={`${inputClassName} mt-2`} value={projectForm.due_date} onChange={(event) => setProjectForm({ ...projectForm, due_date: event.target.value })} /></label>
        <div className="sm:col-span-2 lg:col-span-4"><button className={primaryButtonClassName} disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Save changes</button></div>
      </form></Panel>}

      <Panel title="Team" description={`${members.length} member${members.length === 1 ? '' : 's'} assigned to this project`}>
        {members.length === 0 ? <EmptyState icon={Users} title="No team members" description="Assign employees so they can access this project." /> : (
          <div className="divide-y divide-border">
            {members.map((member) => {
              const lead = isLead(member)
              return (
                <div key={member.user_id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {member.profiles?.full_name || member.profiles?.email || 'Unknown user'}
                      {member.user_id === project.owner_id && <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono-tech text-[9px] text-accent">OWNER</span>}
                      {member.user_id === project.manager_id && <span className="rounded border border-border px-1.5 py-0.5 font-mono-tech text-[9px] text-text-tertiary">MANAGER</span>}
                    </p>
                    <p className="mt-1 text-xs text-text-tertiary">{member.profiles?.email || ''}</p>
                  </div>
                  {can('project.assign') && !lead && (
                    <button onClick={() => void removeMember(member)} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Remove ${member.profiles?.full_name || member.profiles?.email}`}><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {can('project.assign') && (
          <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row sm:items-center">
            <select aria-label="Add a team member" className={`${inputClassName} sm:max-w-xs`} value={addMemberId} onChange={(event) => setAddMemberId(event.target.value)}>
              <option value="">Add a team member…</option>
              {addableMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}{member.job_title ? ` · ${member.job_title}` : ''}</option>)}
            </select>
            <button className={secondaryButtonClassName} onClick={() => void addMember()} disabled={!addMemberId || saving}><UserPlus className="h-4 w-4" /> Add</button>
          </div>
        )}
      </Panel>

      {project.source_submission_id && can('submission.view') && (
        <Panel className="border-emerald-500/25 bg-emerald-500/[0.03] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><FileInput className="mt-0.5 h-4 w-4 text-emerald-400" /><div><p className="text-sm font-semibold text-fg">Created from a form submission</p><p className="mt-1 text-xs text-text-tertiary">Original reference and submitted answers are preserved in the Submission Inbox.</p></div></div>
            <Link href={`/submissions?submission=${project.source_submission_id}`} className={secondaryButtonClassName}>View source submission</Link>
          </div>
        </Panel>
      )}

      <Panel title="Tasks" description={`${tasks.length} task${tasks.length === 1 ? '' : 's'} in this project — click a row for the full detail and activity`}>
        {tasks.length === 0 ? <EmptyState icon={FolderKanban} title="No tasks yet" description="Create the first task for this project." action={can('task.create') ? <button className={primaryButtonClassName} onClick={openTask}><Plus className="h-4 w-4" /> New task</button> : undefined} /> : <div className="divide-y divide-border">{tasks.map((task) => {
          const isHighlighted = highlightTaskId === task.id
          return (
            <div
              key={task.id}
              id={`task-${task.id}`}
              role="button"
              tabIndex={0}
              onClick={() => setDetailTaskId(task.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setDetailTaskId(task.id)
                }
              }}
              className={`flex cursor-pointer flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center transition ${isHighlighted ? 'bg-accent/[0.06] border-l-2 border-accent' : 'border-l-2 border-transparent hover:bg-surface-raised'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{task.title}</p>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${taskPriorityBadgeClass(task.priority)}`}>{TASK_PRIORITY_LABELS[task.priority]}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${taskDueBadgeClass(task)}`}>{formatTaskDueDate(task.due_date)}</span>
                  {isHighlighted && <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono-tech text-[9px] font-semibold text-accent">HIGHLIGHTED</span>}
                </div>
                <p className="mt-1 text-xs text-text-tertiary">{task.profiles?.full_name || task.profiles?.email || 'Unassigned'}</p>
              </div>
              <select
                aria-label={`Status for ${task.title}`}
                className={`${inputClassName} lg:w-40`}
                value={task.status}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => void moveTask(task, event.target.value as TaskStatus)}
              >
                {taskStatuses.map((value) => <option value={value} key={value}>{taskStatusLabels[value]}</option>)}
              </select>
              {(can('task.delete') || task.created_by === user?.id) && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    void removeTask(task)
                  }}
                  className="rounded-md border border-border p-2 text-text-tertiary hover:text-red-400"
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}</div>}
      </Panel>

      <ProjectActivityTimeline key={activityKey} projectId={project.id} />

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projects={[project]}
          onClose={() => setDetailTaskId(null)}
          onChanged={load}
        />
      )}

      <CreateTaskModal
        open={taskModal}
        projects={[project]}
        fixedProjectId={project.id}
        defaultAssigneeId={user?.id}
        onClose={() => setTaskModal(false)}
        onCreated={async () => {
          setMessage('Task created.')
          await load()
        }}
      />
    </Page>
  )
}
