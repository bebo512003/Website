'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Flame,
  FolderKanban,
  ListTodo,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getMyTasks, getProjects, getTaskById, updateTask } from '@/lib/db'
import type { ProjectWithClient, TaskStatus, TaskWithRelations } from '@/lib/supabase/types'
import {
  OPEN_TASK_STATUSES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  compareTasksForMyWork,
  formatTaskDueDate,
  isOpenTask,
  taskDueBadgeClass,
  taskDueState,
  taskPriorityBadgeClass,
  type TaskDueState,
} from '@/lib/tasks'
import { CreateTaskModal } from '@/components/tasks/create-task-modal'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  Page,
  PageHeader,
  Panel,
  primaryButtonClassName,
} from '@/components/ui/page'

type MyWorkFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'high'

const FILTER_LABELS: Record<MyWorkFilter, string> = {
  all: 'All my tasks',
  today: 'Due today',
  upcoming: 'Upcoming · 7 days',
  overdue: 'Overdue',
  high: 'High priority',
}

function matchesFilter(task: TaskWithRelations, filter: MyWorkFilter): boolean {
  if (filter === 'all') return true
  if (!isOpenTask(task)) return false
  if (filter === 'high') return task.priority === 'high'
  return taskDueState(task.due_date) === filter
}

function dueStateLabel(state: TaskDueState): string | null {
  switch (state) {
    case 'overdue':
      return 'Overdue'
    case 'today':
      return 'Due today'
    case 'upcoming':
      return 'Upcoming'
    default:
      return null
  }
}

export default function MyWorkPage() {
  const { user, profile, can } = useAuth()
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<MyWorkFilter>('all')
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [externalTask, setExternalTask] = useState<TaskWithRelations | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [taskResult, projectResult] = await Promise.all([getMyTasks(user.id), getProjects()])
    setTasks(taskResult.data)
    setProjects(projectResult.data)
    setError(taskResult.error || projectResult.error || '')
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  // Notification deep links: /my-work?task=<id> opens the task directly. When
  // it is not among my assigned tasks anymore (reassigned since), fall back to
  // a direct fetch — RLS decides whether the account may still see it.
  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    const requested = new URLSearchParams(window.location.search).get('task')
    if (!requested) return
    const mine = tasks.find((task) => task.id === requested)
    if (mine) {
      setDetailTaskId(requested)
      return
    }
    void getTaskById(requested).then((result) => {
      if (result.data) {
        setExternalTask(result.data)
        setDetailTaskId(requested)
      }
    })
    // Only react to a completed initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // The modal always renders the freshest copy of the task from the last load.
  const detailTask = detailTaskId ? (tasks.find((task) => task.id === detailTaskId) ?? externalTask) : null

  const openTasks = useMemo(() => tasks.filter(isOpenTask).sort(compareTasksForMyWork), [tasks])
  const doneTasks = useMemo(
    () =>
      tasks
        .filter((task) => !isOpenTask(task))
        .sort((a, b) => (b.completed_date || b.updated_at).localeCompare(a.completed_date || a.updated_at)),
    [tasks],
  )
  const visibleTasks = useMemo(() => openTasks.filter((task) => matchesFilter(task, filter)), [openTasks, filter])

  const stats = useMemo(() => {
    const count = (state: TaskDueState) => openTasks.filter((task) => taskDueState(task.due_date) === state).length
    return [
      { key: 'all' as const, label: 'Open tasks', value: openTasks.length, icon: ListTodo, tone: 'text-accent' },
      { key: 'today' as const, label: 'Due today', value: count('today'), icon: CalendarClock, tone: 'text-amber-400' },
      { key: 'upcoming' as const, label: 'Upcoming · 7 days', value: count('upcoming'), icon: CalendarCheck, tone: 'text-sky-400' },
      { key: 'overdue' as const, label: 'Overdue', value: count('overdue'), icon: CircleAlert, tone: 'text-red-400' },
      { key: 'high' as const, label: 'High priority', value: openTasks.filter((task) => task.priority === 'high').length, icon: Flame, tone: 'text-orange-400' },
    ]
  }, [openTasks])

  const tasksByProject = useMemo(() => {
    const groups = new Map<string, { name: string; open: number; done: number }>()
    for (const task of tasks) {
      const group = groups.get(task.project_id) || { name: task.projects?.name || 'Unknown project', open: 0, done: 0 }
      if (isOpenTask(task)) group.open += 1
      else group.done += 1
      groups.set(task.project_id, group)
    }
    return [...groups.entries()]
      .map(([id, group]) => ({ id, ...group, total: group.open + group.done }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
  }, [tasks])

  const move = async (task: TaskWithRelations, status: TaskStatus) => {
    const result = await updateTask(task.id, {
      status,
      completed_date: status === 'done' ? new Date().toISOString().slice(0, 10) : null,
    })
    if (result.error) setError(result.error)
    else await load()
  }

  const openDetail = (task: TaskWithRelations) => {
    setExternalTask(null)
    setDetailTaskId(task.id)
  }

  const closeDetail = () => {
    setDetailTaskId(null)
    setExternalTask(null)
  }

  const renderTaskRow = (task: TaskWithRelations) => {
    const stateLabel = isOpenTask(task) ? dueStateLabel(taskDueState(task.due_date)) : null
    return (
      <div
        key={task.id}
        className="flex cursor-pointer flex-col gap-3 px-5 py-4 transition hover:bg-surface-raised sm:flex-row sm:items-center sm:gap-4"
        role="button"
        tabIndex={0}
        onClick={() => openDetail(task)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openDetail(task)
          }
        }}
      >
        <select
          aria-label={`Status for ${task.title}`}
          className="w-full shrink-0 rounded-md border border-border bg-surface-raised px-2.5 py-2 text-xs text-fg outline-none focus:border-accent sm:w-32"
          value={task.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation()
            void move(task, event.target.value as TaskStatus)
          }}
        >
          {OPEN_TASK_STATUSES.concat('done').map((value) => (
            <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>
          ))}
        </select>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${task.status === 'done' ? 'text-text-tertiary line-through' : ''}`}>{task.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-tertiary">
            <Link
              href={`/projects/${task.project_id}`}
              onClick={(event) => event.stopPropagation()}
              className="hover:text-accent"
            >
              {task.projects?.name || 'Project unavailable'}
            </Link>
            {stateLabel && <span aria-hidden="true">·</span>}
            {stateLabel && <span>{stateLabel}</span>}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${taskPriorityBadgeClass(task.priority)}`}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
          <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${taskDueBadgeClass(task)}`}>
            {formatTaskDueDate(task.due_date)}
          </span>
          <ChevronRight className="h-4 w-4 text-text-tertiary" />
        </div>
      </div>
    )
  }

  const greeting = profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''

  return (
    <Page>
      <PageHeader
        eyebrow="MY WORK / PERSONAL TASKS"
        title={`My Work${greeting}`}
        description="Every task assigned to you across the projects your account is authorized to access — nothing else."
        action={
          can('task.create') && projects.length > 0 ? (
            <button className={primaryButtonClassName} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New task
            </button>
          ) : undefined
        }
      />
      {error && <InlineAlert>{error}</InlineAlert>}

      {loading ? (
        <Panel><LoadingState label="Loading your work…" /></Panel>
      ) : tasks.length === 0 ? (
        <Panel>
          <EmptyState
            icon={CheckCircle2}
            title="No tasks assigned to you"
            description="When a manager assigns you a task in one of your projects, it shows up here — with due-date tracking and priorities."
            action={
              can('task.create') && projects.length > 0 ? (
                <button className={primaryButtonClassName} onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Create your first task
                </button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          <section className="grid gap-4 grid-cols-2 lg:grid-cols-5" aria-label="My workload summary">
            {stats.map(({ key, label, value, icon: Icon, tone }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`rounded-md border bg-surface p-4 text-left transition hover:border-line-light ${
                  filter === key ? 'border-accent ring-1 ring-accent/40' : 'border-border'
                }`}
              >
                <Icon className={`h-5 w-5 ${tone}`} />
                <p className="mt-4 font-display text-4xl leading-none">{value}</p>
                <p className="mt-2 text-xs text-text-tertiary">{label}</p>
              </button>
            ))}
          </section>

          <Panel
            title={FILTER_LABELS[filter]}
            description={
              filter === 'all'
                ? `${visibleTasks.length} open task${visibleTasks.length === 1 ? '' : 's'} assigned to you, nearest due date first`
                : `${visibleTasks.length} task${visibleTasks.length === 1 ? '' : 's'} — click a row for the full detail and activity`
            }
          >
            {visibleTasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title={filter === 'all' ? 'All clear' : `Nothing ${FILTER_LABELS[filter].toLowerCase()}`}
                description={
                  filter === 'all'
                    ? 'You have no open tasks assigned right now.'
                    : 'Switch back to “All my tasks” to see everything on your plate.'
                }
                action={
                  filter !== 'all' ? (
                    <button type="button" className={primaryButtonClassName} onClick={() => setFilter('all')}>
                      Show all my tasks
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border">{visibleTasks.map(renderTaskRow)}</div>
            )}
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Tasks by project" description="Your assigned work, grouped by project — open first">
              {tasksByProject.length === 0 ? (
                <EmptyState icon={FolderKanban} title="No project work" description="Assigned tasks will group here by project." />
              ) : (
                <div className="divide-y divide-border">
                  {tasksByProject.map((group) => {
                    const percent = group.total === 0 ? 0 : Math.round((group.done / group.total) * 100)
                    return (
                      <Link key={group.id} href={`/projects/${group.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised">
                        <FolderKanban className="h-4 w-4 shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{group.name}</p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                        <p className="shrink-0 text-xs text-text-tertiary">
                          <span className="font-semibold text-fg">{group.open}</span> open · {group.done} done
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )}
            </Panel>

            <Panel
              title="Completed"
              description={`${doneTasks.length} task${doneTasks.length === 1 ? '' : 's'} finished by you`}
            >
              {doneTasks.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing completed yet" description="Finished tasks land here for reference." />
              ) : (
                <>
                  <div className="divide-y divide-border">
                    {(showCompleted ? doneTasks : doneTasks.slice(0, 5)).map(renderTaskRow)}
                  </div>
                  {doneTasks.length > 5 && (
                    <div className="border-t border-border p-4">
                      <button
                        type="button"
                        className="text-xs font-medium text-text-secondary hover:text-accent"
                        onClick={() => setShowCompleted((value) => !value)}
                      >
                        {showCompleted ? 'Show fewer' : `Show all ${doneTasks.length} completed tasks`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
        </>
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projects={projects}
          onClose={closeDetail}
          onChanged={load}
        />
      )}

      <CreateTaskModal
        open={createOpen}
        projects={projects}
        defaultAssigneeId={user?.id}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
    </Page>
  )
}
