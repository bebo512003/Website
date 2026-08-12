'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createTask, getTaskAssignees } from '@/lib/supabase/database'
import type { ProjectWithClient, TaskAssignee, TaskPriority } from '@/lib/supabase/types'
import { TASK_PRIORITY_LABELS } from '@/lib/tasks'
import {
  InlineAlert,
  Modal,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '@/components/ui/page'

const PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high']

/**
 * Shared task-creation dialog. The assignee options come straight from the
 * database guard (list_task_assignees): project members first, then staff the
 * permission model explicitly allows — so the dropdown can never propose a
 * person the server would reject.
 */
export function CreateTaskModal({
  open,
  projects,
  fixedProjectId,
  defaultAssigneeId,
  onClose,
  onCreated,
}: {
  open: boolean
  projects: ProjectWithClient[]
  /** When set (e.g. project detail page), the project field is locked. */
  fixedProjectId?: string
  defaultAssigneeId?: string
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    project_id: '',
    priority: 'medium' as TaskPriority,
    assignee_id: '',
    due_date: '',
  })

  // Start from a clean form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setForm({
      title: '',
      description: '',
      project_id: fixedProjectId || projects[0]?.id || '',
      priority: 'medium',
      assignee_id: defaultAssigneeId ?? user?.id ?? '',
      due_date: '',
    })
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedProjectId])

  const projectId = form.project_id

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false
    void getTaskAssignees(projectId).then((result) => {
      if (cancelled) return
      if (result.error) {
        setAssignees([])
        setError(result.error)
        return
      }
      setAssignees(result.data)
      // A project switch must not smuggle an invalid assignee into the insert.
      setForm((previous) =>
        previous.assignee_id && !result.data.some((assignee) => assignee.id === previous.assignee_id)
          ? { ...previous, assignee_id: '' }
          : previous,
      )
    })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await createTask({
      title: form.title.trim(),
      description: form.description.trim() || null,
      project_id: form.project_id,
      priority: form.priority,
      assignee_id: form.assignee_id || null,
      due_date: form.due_date || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onClose()
    await onCreated()
  }

  return (
    <Modal open={open} onClose={onClose} title="Create task" description="The task inherits the selected project's access controls — only its team (and Managers/Admins) can be assigned.">
      {error && <div className="mb-4"><InlineAlert>{error}</InlineAlert></div>}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-text-secondary sm:col-span-2">
          Title
          <input
            required
            className={`${inputClassName} mt-2`}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>

        <label className="text-xs text-text-secondary">
          Project
          <select
            required
            disabled={Boolean(fixedProjectId)}
            className={`${inputClassName} mt-2`}
            value={form.project_id}
            onChange={(event) => setForm({ ...form, project_id: event.target.value })}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-text-secondary">
          Assignee
          <select
            className={`${inputClassName} mt-2`}
            value={form.assignee_id}
            onChange={(event) => setForm({ ...form, assignee_id: event.target.value })}
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.full_name || assignee.email}
                {assignee.job_title ? ` · ${assignee.job_title}` : ''}
                {assignee.is_member ? '' : ' · not on the team'}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-text-secondary">
          Priority
          <select
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
            className={`${inputClassName} mt-2`}
            value={form.due_date}
            onChange={(event) => setForm({ ...form, due_date: event.target.value })}
          />
        </label>

        <label className="text-xs text-text-secondary sm:col-span-2">
          Description
          <textarea
            className={`${inputClassName} mt-2 min-h-24`}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>

        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className={secondaryButtonClassName}>Cancel</button>
          <button className={primaryButtonClassName} disabled={saving || !form.project_id}>
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Create task
          </button>
        </div>
      </form>
    </Modal>
  )
}
