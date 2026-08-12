// Shared logic for the unified project activity & audit timeline (Session 14).
//
// The project detail page merges two append-only feeds into one chronological
// history: project-level events (`project_activity`) and task-level events
// (`task_activity`). Audit/system events are kept separate from client-facing
// comments — this module only ever deals with the audit feeds.
import type {
  Profile,
  ProjectActivity,
  ProjectActivityEventType,
  TaskActivity,
  TaskActivityEventType,
} from '@/lib/supabase/types'
import { PROJECT_STATUS_LABELS } from '@/lib/project-lifecycle'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, formatActivityTime } from '@/lib/tasks'

export type ProjectFeedActor = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null

/** A single normalized entry on the unified project timeline. */
export type ProjectFeedEntry =
  | {
      source: 'project'
      id: string
      created_at: string
      actor: ProjectFeedActor
      event_type: ProjectActivityEventType
      old_value: string | null
      new_value: string | null
      metadata: Record<string, unknown>
    }
  | {
      source: 'task'
      id: string
      created_at: string
      actor: ProjectFeedActor
      event_type: TaskActivityEventType
      old_value: string | null
      new_value: string | null
      metadata: Record<string, unknown>
      task_id: string
      task_title: string
    }

export const PROJECT_ACTIVITY_LABELS: Record<ProjectActivityEventType, string> = {
  created: 'Project created',
  submission_converted: 'Converted from submission',
  owner_changed: 'Owner changed',
  manager_changed: 'Manager changed',
  member_added: 'Team member added',
  member_removed: 'Team member removed',
  status_changed: 'Status changed',
  deadline_changed: 'Deadline changed',
  file_uploaded: 'File uploaded',
  file_deleted: 'File deleted',
  delivery_prepared: 'Delivery package prepared',
  delivery_ready: 'Delivery marked ready',
  delivery_sent: 'Delivery sent',
  delivery_file_added: 'Final delivery file added',
  delivery_file_removed: 'Final delivery file removed',
  revision_requested: 'Revision requested',
  approval_recorded: 'Internal approval recorded',
  archived: 'Project archived',
  unarchived: 'Project unarchived',
}

/** Who performed the event — falls back to "System" for automatic rows. */
export function feedActorName(actor: ProjectFeedActor): string {
  return actor?.full_name || actor?.email || 'System'
}

function statusLabel(value: string | null): string {
  return PROJECT_STATUS_LABELS[value as keyof typeof PROJECT_STATUS_LABELS] || value || '—'
}

function taskStatusLabel(value: string | null): string {
  return TASK_STATUS_LABELS[value as keyof typeof TASK_STATUS_LABELS] || value || '—'
}

function taskPriorityLabel(value: string | null): string {
  return TASK_PRIORITY_LABELS[value as keyof typeof TASK_PRIORITY_LABELS] || value || '—'
}

function dateLabel(value: string | null): string {
  if (!value) return 'no date'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A short human sentence describing "what happened" for a project event. */
export function projectEventSummary(entry: Extract<ProjectFeedEntry, { source: 'project' }>): string {
  switch (entry.event_type) {
    case 'created':
      return 'created this project'
    case 'submission_converted':
      return 'created this project from a form submission'
    case 'owner_changed':
      return entry.new_value
        ? entry.old_value
          ? `changed the owner from ${entry.old_value} to ${entry.new_value}`
          : `set the owner to ${entry.new_value}`
        : `removed ${entry.old_value || 'the owner'}`
    case 'manager_changed':
      return entry.new_value
        ? entry.old_value
          ? `changed the manager from ${entry.old_value} to ${entry.new_value}`
          : `set the manager to ${entry.new_value}`
        : `removed ${entry.old_value || 'the manager'}`
    case 'member_added':
      return entry.new_value ? `added ${entry.new_value} to the team` : 'added a team member'
    case 'member_removed':
      return entry.old_value ? `removed ${entry.old_value} from the team` : 'removed a team member'
    case 'status_changed':
      return `moved status from ${statusLabel(entry.old_value)} to ${statusLabel(entry.new_value)}`
    case 'deadline_changed':
      return entry.new_value
        ? entry.old_value
          ? `changed the deadline from ${dateLabel(entry.old_value)} to ${dateLabel(entry.new_value)}`
          : `set the deadline to ${dateLabel(entry.new_value)}`
        : `cleared the deadline${entry.old_value ? ` (was ${dateLabel(entry.old_value)})` : ''}`
    case 'file_uploaded':
      return entry.new_value ? `uploaded the file “${entry.new_value}”` : 'uploaded a file'
    case 'file_deleted':
      return entry.old_value ? `deleted the file “${entry.old_value}”` : 'deleted a file'
    default:
      return 'updated this project'
  }
}

/** A short human sentence describing "what happened" for a task event. */
export function taskEventSummary(entry: Extract<ProjectFeedEntry, { source: 'task' }>): string {
  const inTask = entry.task_title ? ` on “${entry.task_title}”` : ''
  switch (entry.event_type) {
    case 'created':
      return `created a task${inTask ? ` “${entry.task_title}”` : ''}`
    case 'status_changed':
      if (entry.new_value === 'done') return `completed the task “${entry.task_title || '…'}”`
      return `moved the task “${entry.task_title || '…'}” from ${taskStatusLabel(entry.old_value)} to ${taskStatusLabel(entry.new_value)}`
    case 'priority_changed':
      return `changed the priority of “${entry.task_title || '…'}” from ${taskPriorityLabel(entry.old_value)} to ${taskPriorityLabel(entry.new_value)}`
    case 'assignee_changed':
      return entry.new_value
        ? entry.old_value
          ? `reassigned “${entry.task_title || '…'}” from ${entry.old_value} to ${entry.new_value}`
          : `assigned “${entry.task_title || '…'}” to ${entry.new_value}`
        : `unassigned “${entry.task_title || '…'}”${entry.old_value ? ` (was ${entry.old_value})` : ''}`
    case 'due_date_changed':
      return entry.new_value
        ? `set the due date of “${entry.task_title || '…'}” to ${dateLabel(entry.new_value)}`
        : `removed the due date of “${entry.task_title || '…'}”`
    case 'title_changed':
      return entry.old_value ? `renamed the task from “${entry.old_value}”` : 'renamed a task'
    case 'description_changed':
      return `updated the description of “${entry.task_title || '…'}”`
    case 'project_changed':
      return `moved a task to this project${entry.new_value ? ` (from ${entry.old_value || 'another project'})` : ''}`
    case 'note':
      return 'added a work note'
    default:
      return `updated the task${inTask}`
  }
}

function toProjectEntry(activity: ProjectActivity): Extract<ProjectFeedEntry, { source: 'project' }> {
  return {
    source: 'project',
    id: activity.id,
    created_at: activity.created_at,
    actor: activity.actor ?? null,
    event_type: activity.event_type,
    old_value: activity.old_value,
    new_value: activity.new_value,
    metadata: (activity.metadata ?? {}) as Record<string, unknown>,
  }
}

function toTaskEntry(activity: TaskActivity): Extract<ProjectFeedEntry, { source: 'task' }> {
  const metadata = (activity.metadata ?? {}) as Record<string, unknown>
  return {
    source: 'task',
    id: activity.id,
    created_at: activity.created_at,
    actor: activity.actor ?? null,
    event_type: activity.event_type,
    old_value: activity.old_value,
    new_value: activity.new_value,
    metadata,
    task_id: activity.task_id,
    task_title: (activity.new_value && activity.event_type === 'created' ? activity.new_value : (metadata.task_title as string | undefined)) || '',
  }
}

/** Merges project- and task-level events into one newest-first feed. */
export function mergeProjectActivity(projectActivity: ProjectActivity[], taskActivity: TaskActivity[]): ProjectFeedEntry[] {
  const entries: ProjectFeedEntry[] = [
    ...projectActivity.map(toProjectEntry),
    ...taskActivity.map(toTaskEntry),
  ]
  return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export { formatActivityTime }
