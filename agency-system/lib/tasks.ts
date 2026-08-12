import type { Task, TaskPriority, TaskStatus } from '@/lib/supabase/types'

/**
 * Shared task presentation + date logic used by My Work, the team board, and
 * project task lists. Date math is done on LOCAL calendar dates because
 * `tasks.due_date` is a plain date (no timezone) — parsing it as UTC would
 * shift the day for users west of Greenwich.
 */

export const TASK_STATUS_ORDER: TaskStatus[] = ['todo', 'inprogress', 'review', 'done']

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  inprogress: 'In progress',
  review: 'Review',
  done: 'Done',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const TASK_PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

/** Statuses that still represent work to do (used by the personal lists). */
export const OPEN_TASK_STATUSES: TaskStatus[] = ['todo', 'inprogress', 'review']

export function isOpenTask(task: Pick<Task, 'status'>): boolean {
  return task.status !== 'done'
}

/** Parses a `YYYY-MM-DD` date string as a local calendar date. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export type TaskDueState = 'overdue' | 'today' | 'upcoming' | 'later' | 'none'

export const UPCOMING_WINDOW_DAYS = 7

/**
 * Buckets a due date relative to "today". Done tasks never flag as overdue in
 * the UI, but the state math stays status-agnostic so callers can decide.
 */
export function taskDueState(dueDate: string | null | undefined, referenceDate: Date = new Date()): TaskDueState {
  const due = parseLocalDate(dueDate)
  if (!due) return 'none'
  const now = startOfDay(referenceDate)
  const target = startOfDay(due)
  if (target < now) return 'overdue'
  if (target === now) return 'today'
  if (target <= now + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000) return 'upcoming'
  return 'later'
}

export function formatTaskDueDate(dueDate: string | null | undefined): string {
  const date = parseLocalDate(dueDate)
  if (!date) return 'No due date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Presentational class names for a due badge, aware of completion. */
export function taskDueBadgeClass(task: Pick<Task, 'due_date' | 'status'>): string {
  if (!task.due_date) return 'border-border text-text-tertiary'
  const state = taskDueState(task.due_date)
  if (task.status === 'done') return 'border-emerald-500/30 text-emerald-400'
  switch (state) {
    case 'overdue':
      return 'border-red-500/40 bg-red-500/10 text-red-400'
    case 'today':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-400'
    case 'upcoming':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-400'
    default:
      return 'border-border text-text-tertiary'
  }
}

export function taskPriorityBadgeClass(priority: TaskPriority): string {
  switch (priority) {
    case 'high':
      return 'border-red-500/40 bg-red-500/10 text-red-400'
    case 'medium':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-400'
    default:
      return 'border-border text-text-tertiary'
  }
}

export function taskStatusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case 'done':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
    case 'review':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-400'
    case 'inprogress':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-400'
    default:
      return 'border-border text-text-tertiary'
  }
}

/** Sort order for personal work lists: open first, then nearest due date, then priority. */
export function compareTasksForMyWork(a: Task, b: Task): number {
  const aOpen = isOpenTask(a) ? 0 : 1
  const bOpen = isOpenTask(b) ? 0 : 1
  if (aOpen !== bOpen) return aOpen - bOpen

  const aDue = parseLocalDate(a.due_date)?.getTime() ?? null
  const bDue = parseLocalDate(b.due_date)?.getTime() ?? null
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue
  if (aDue !== null && bDue === null) return -1
  if (aDue === null && bDue !== null) return 1

  const priorityDiff = TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority]
  if (priorityDiff !== 0) return priorityDiff

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

/** Short human timestamp for activity feeds: relative when recent, absolute afterwards. */
export function formatActivityTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = now.getTime() - then
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
