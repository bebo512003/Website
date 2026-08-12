'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { History, LoaderCircle, Send, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { addTaskNote, deleteTask, getTaskActivity, getTaskAssignees, updateTask } from '@/lib/supabase/database'
import type {
  ProjectWithClient,
  TaskActivity,
  TaskAssignee,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
  TaskWithRelations,
} from '@/lib/supabase/types'
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  formatActivityTime,
  formatTaskDueDate,
  taskDueBadgeClass,
  taskPriorityBadgeClass,
  taskStatusBadgeClass,
} from '@/lib/tasks'
import {
  InlineAlert,
  Modal,
  inputClassName,
  primaryButtonClassName,
} from '@/components/ui/page'

const PRIORITY_ORDER: TaskPriority[] = ['high', 'medium', 'low']

function statusLabel(value: string | null): string {
  return TASK_STATUS_LABELS[value as TaskStatus] || value || '—'
}

function eventSummary(activity: TaskActivity): string {
  switch (activity.event_type) {
    case 'created':
      return 'created this task'
    case 'status_changed':
      return `moved status from ${statusLabel(activity.old_value)} to ${statusLabel(activity.new_value)}`
    case 'priority_changed':
      return `changed priority from ${(activity.old_value || '—').toLowerCase()} to ${(activity.new_value || '—').toLowerCase()}`
    case 'assignee_changed':
      return activity.new_value
        ? activity.old_value
          ? `reassigned from ${activity.old_value} to ${activity.new_value}`
          : `assigned to ${activity.new_value}`
        : `unassigned${activity.old_value ? ` ${activity.old_value}` : ''}`
    case 'due_date_changed':
      return activity.new_value
        ? `set the due date to ${formatTaskDueDate(activity.new_value)}`
        : 'removed the due date'
    case 'title_changed':
      return activity.old_value ? `renamed from “${activity.old_value}”` : 'renamed this task'
    case 'description_changed':
      return 'updated the description'
    case 'project_changed':
      return `moved from “${activity.old_value || 'Unknown project'}” to “${activity.new_value || 'Unknown project'}”`
    default:
      return 'updated this task'
  }
}

function actorName(activity: TaskActivity): string {
  return activity.actor?.full_name || activity.actor?.email || 'System'
}

/**
 * The single task workspace used across My Work, the team board, and project
 * pages: full editing (status, priority, assignee, due date, description,
 * project) plus the append-only activity feed. Every write still goes through
 * the same RLS policies and assignee guard as any other client.
 */
export function TaskDetailModal({
  task,
  projects,
  onClose,
  onChanged,
}: {
  task: TaskWithRelations | null
  /** Accessible projects the task may live in (destination options for a move). */
  projects: ProjectWithClient[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const { user, can } = useAuth()
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
    priority: 'medium' as TaskPriority,
    due_date: '',
    project_id: '',
    assignee_id: '',
  })
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [activity, setActivity] = useState<TaskActivity[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [note, setNote] = useState('')
  const [postingNote, setPostingNote] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const taskId = task?.id || null

  // Reset the editor whenever a different task is opened.
  useEffect(() => {
    if (!task) return
    setForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date || '',
      project_id: task.project_id,
      assignee_id: task.assignee_id || '',
    })
    setError('')
    setMessage('')
    setNote('')
    setActivity([])
    setActivityLoaded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  // Load the activity feed once per opened task.
  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    setActivityLoaded(false)
    void getTaskActivity(taskId).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      else setActivity(result.data)
      setActivityLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [taskId])

  const currentProjectId = task?.project_id || ''
  const formProjectId = form.project_id

  // Valid assignees for the project currently selected in the form. Options
  // come from the database rule (list_task_assignees), so whatever the user
  // picks here the server-side guard will also accept.
  useEffect(() => {
    if (!taskId || !formProjectId) return
    let cancelled = false
    void getTaskAssignees(formProjectId).then((result) => {
      if (cancelled) return
      if (result.error) {
        setAssignees([])
        return
      }
      setAssignees(result.data)
      // Moving a task to another project must never carry an invalid assignee.
      if (formProjectId !== currentProjectId) {
        setForm((previous) =>
          previous.assignee_id && !result.data.some((a) => a.id === previous.assignee_id)
            ? { ...previous, assignee_id: '' }
            : previous,
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [taskId, formProjectId, currentProjectId])

  if (!task) return null

  const isAssignee = task.assignee_id === user?.id
  const isCreator = task.created_by === user?.id
  // Mirrors tasks_update_authorized: permission, assignee, or creator of an
  // unassigned task may write.
  const canEdit = can('task.edit') || isAssignee || (isCreator && task.assignee_id === null)
  const canAssign = canEdit && can('task.assign')
  const canDelete = can('task.delete') || isCreator
  const isOpen = task.status !== 'done'

  // Keep the current assignee selectable even if they lost eligibility since.
  const assigneeOptions: TaskAssignee[] =
    task.assignee_id && !assignees.some((a) => a.id === task.assignee_id)
      ? [
          {
            id: task.assignee_id,
            full_name: task.profiles?.full_name || task.profiles?.email || 'Current assignee',
            email: task.profiles?.email || '',
            job_title: null,
            role: 'employee',
            is_member: false,
          },
          ...assignees,
        ]
      : assignees

  const reloadActivity = async () => {
    if (!task) return
    const result = await getTaskActivity(task.id)
    if (!result.error) setActivity(result.data)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const updates: TaskUpdate = {}
    const title = form.title.trim()
    if (!title) {
      setSaving(false)
      setError('A task title is required.')
      return
    }
    if (title !== task.title) updates.title = title
    const description = form.description.trim()
    if (description !== (task.description || '')) updates.description = description || null
    if (form.status !== task.status) {
      updates.status = form.status
      updates.completed_date = form.status === 'done' ? new Date().toISOString().slice(0, 10) : null
    }
    if (form.priority !== task.priority) updates.priority = form.priority
    if ((form.due_date || null) !== task.due_date) updates.due_date = form.due_date || null
    if (form.project_id !== task.project_id) updates.project_id = form.project_id
    if ((form.assignee_id || null) !== task.assignee_id) updates.assignee_id = form.assignee_id || null

    if (Object.keys(updates).length === 0) {
      setSaving(false)
      setMessage('Nothing changed.')
      return
    }

    const result = await updateTask(task.id, updates)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage('Task saved.')
    await Promise.all([reloadActivity(), onChanged()])
  }

  const postNote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    setPostingNote(true)
    setError('')
    const result = await addTaskNote(task.id, note)
    setPostingNote(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNote('')
    await reloadActivity()
  }

  const remove = async () => {
    if (!window.confirm(`Delete “${task.title}”?`)) return
    setDeleting(true)
    setError('')
    const result = await deleteTask(task.id)
    setDeleting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onClose()
    await onChanged()
  }

  const readOnlyMeta = `Assigned to ${task.profiles?.full_name || task.profiles?.email || 'no one'} · ${TASK_PRIORITY_LABELS[task.priority]} priority`

  return (
    <Modal open onClose={onClose} title={task.title} description={readOnlyMeta} maxWidthClassName="max-w-3xl">
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      {message && <div className="mb-4"><InlineAlert tone="success">{message}</InlineAlert></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-text-secondary sm:col-span-2">
            Title
            <input
              required
              disabled={!canEdit}
              className={`${inputClassName} mt-2`}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>

          <label className="text-xs text-text-secondary">
            Status
            <select
              disabled={!canEdit}
              className={`${inputClassName} mt-2`}
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
            >
              {TASK_STATUS_ORDER.map((value) => (
                <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-text-secondary">
            Priority
            <select
              disabled={!canEdit}
              className={`${inputClassName} mt-2`}
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}
            >
              {PRIORITY_ORDER.map((value) => (
                <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-text-secondary">
            Due date
            <input
              type="date"
              disabled={!canEdit}
              className={`${inputClassName} mt-2`}
              value={form.due_date}
              onChange={(event) => setForm({ ...form, due_date: event.target.value })}
            />
          </label>

          <label className="text-xs text-text-secondary">
            Assignee{canAssign ? '' : ' (read-only)'}
            <select
              disabled={!canAssign}
              className={`${inputClassName} mt-2`}
              value={form.assignee_id}
              onChange={(event) => setForm({ ...form, assignee_id: event.target.value })}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.full_name || assignee.email}
                  {assignee.is_member ? '' : ' · not on the team'}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-text-secondary sm:col-span-2">
            Project
            <select
              disabled={!canEdit || projects.length < 2}
              className={`${inputClassName} mt-2`}
              value={form.project_id}
              onChange={(event) => setForm({ ...form, project_id: event.target.value })}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-text-secondary sm:col-span-2">
            Description
            <textarea
              disabled={!canEdit}
              className={`${inputClassName} mt-2 min-h-28`}
              placeholder="What needs to happen, context, links…"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${taskStatusBadgeClass(task.status)}`}>
                {TASK_STATUS_LABELS[task.status]}
              </span>
              <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${taskPriorityBadgeClass(task.priority)}`}>
                {TASK_PRIORITY_LABELS[task.priority]}
              </span>
              <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${taskDueBadgeClass(task)}`}>
                {formatTaskDueDate(task.due_date)}
              </span>
              {task.projects && (
                <Link
                  href={`/projects/${task.project_id}`}
                  className="rounded border border-border px-2 py-1 text-[10px] font-semibold text-text-tertiary hover:border-accent hover:text-accent"
                >
                  {task.projects.name}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={deleting || saving}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-red-500/30 hover:text-red-400 disabled:opacity-50"
                >
                  {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </button>
              )}
              {canEdit && (
                <button className={primaryButtonClassName} disabled={saving || deleting}>
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Save changes
                </button>
              )}
            </div>
          </div>
        </form>

        <aside className="flex min-h-64 flex-col rounded-md border border-border bg-surface-raised/50">
          <p className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-semibold text-fg">
            <History className="h-3.5 w-3.5 text-accent" /> Activity
          </p>
          <div className="max-h-96 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!activityLoaded ? (
              <p className="flex items-center gap-2 text-xs text-text-tertiary">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading activity…
              </p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-text-tertiary">No activity recorded yet.</p>
            ) : (
              activity.map((entry) =>
                entry.event_type === 'note' ? (
                  <div key={entry.id} className="rounded-md border border-border bg-surface p-3">
                    <p className="flex items-baseline justify-between gap-2 text-[10px] text-text-tertiary">
                      <span className="font-semibold text-fg">{actorName(entry)}</span>
                      <span>{formatActivityTime(entry.created_at)}</span>
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs text-text-secondary">{entry.new_value}</p>
                  </div>
                ) : (
                  <p key={entry.id} className="text-[11px] leading-relaxed text-text-tertiary">
                    <span className="font-semibold text-text-secondary">{actorName(entry)}</span>{' '}
                    {eventSummary(entry)}
                    <span className="text-text-tertiary/70"> · {formatActivityTime(entry.created_at)}</span>
                  </p>
                ),
              )
            )}
          </div>
          {canEdit && isOpen && (
            <form onSubmit={postNote} className="flex items-center gap-2 border-t border-border p-3">
              <input
                className={`${inputClassName} py-2 text-xs`}
                placeholder="Add a work note…"
                aria-label="Add a work note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <button
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
                disabled={postingNote || !note.trim()}
                aria-label="Post note"
              >
                {postingNote ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </form>
          )}
        </aside>
      </div>
    </Modal>
  )
}
