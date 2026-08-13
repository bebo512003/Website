'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckSquare, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { deleteTask, getProjects, getTasksPage, updateTask } from '@/lib/db'
import type { ProjectWithClient, TaskPriority, TaskStatus, TaskWithRelations } from '@/lib/supabase/types'
import {
  TASK_PRIORITY_LABELS,
  formatTaskDueDate,
  isOpenTask,
  taskDueBadgeClass,
  taskDueState,
  taskPriorityBadgeClass,
} from '@/lib/tasks'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { CreateTaskModal } from '@/components/tasks/create-task-modal'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  Page,
  PageHeader,
  Panel,
  inputClassName,
  primaryButtonClassName,
} from '@/components/ui/page'
import { useConfirm } from '@/components/ui/confirm-dialog'

const PAGE_SIZE = 20

const columns: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'inprogress', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

type OwnershipFilter = 'all' | 'mine' | 'unassigned'

const emptyByStatus = (): Record<TaskStatus, TaskWithRelations[]> => ({
  todo: [],
  inprogress: [],
  review: [],
  done: [],
})

export default function TasksPage() {
  const { user, can } = useAuth()
  const confirm = useConfirm()
  const [tasksByStatus, setTasksByStatus] = useState<Record<TaskStatus, TaskWithRelations[]>>(emptyByStatus)
  const [totalsByStatus, setTotalsByStatus] = useState<Record<TaskStatus, number>>({ todo: 0, inprogress: 0, review: 0, done: 0 })
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState<TaskStatus | null>(null)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all')
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all')
  const [search, setSearch] = useState('')

  const debouncedSearch = useDebouncedValue(search, 300)

  const load = useCallback(async () => {
    setLoading(true)
    const [projectResult, ...columnResults] = await Promise.all([
      getProjects(),
      ...columns.map((column) => getTasksPage({
        search: debouncedSearch,
        projectId: projectFilter,
        priority: priorityFilter,
        assignee: ownershipFilter === 'mine' ? 'mine' : ownershipFilter,
        status: column.id,
        page: 1,
        pageSize: PAGE_SIZE,
      })),
    ])
    setProjects(projectResult.data)
    const next = emptyByStatus()
    const totals = { todo: 0, inprogress: 0, review: 0, done: 0 }
    columnResults.forEach((result, index) => {
      const column = columns[index].id
      next[column] = result.data
      totals[column] = result.total
    })
    setTasksByStatus(next)
    setTotalsByStatus(totals)
    setError(projectResult.error || columnResults.find((r) => r.error)?.error || '')
    setLoading(false)
  }, [debouncedSearch, projectFilter, priorityFilter, ownershipFilter])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async (status: TaskStatus) => {
    const loaded = tasksByStatus[status].length
    const nextPage = Math.floor(loaded / PAGE_SIZE) + 1
    setLoadingMore(status)
    const result = await getTasksPage({
      search: debouncedSearch,
      projectId: projectFilter,
      priority: priorityFilter,
      assignee: ownershipFilter === 'mine' ? 'mine' : ownershipFilter,
      status,
      page: nextPage,
      pageSize: PAGE_SIZE,
    })
    setLoadingMore(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setTasksByStatus((current) => ({ ...current, [status]: [...current[status], ...result.data] }))
  }

  const allTasks = useMemo(
    () => Object.values(tasksByStatus).flat(),
    [tasksByStatus]
  )

  const detailTask = detailTaskId ? (allTasks.find((task) => task.id === detailTaskId) ?? null) : null

  const move = async (task: TaskWithRelations, status: TaskStatus) => {
    const result = await updateTask(task.id, {
      status,
      completed_date: status === 'done' ? new Date().toISOString().slice(0, 10) : null,
    })
    if (result.error) setError(result.error)
    else await load()
  }

  const remove = async (task: TaskWithRelations) => {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      description: 'This removes the task and its activity history.',
      confirmLabel: 'Delete task',
      tone: 'destructive',
    })
    if (!ok) return
    const result = await deleteTask(task.id)
    if (result.error) setError(result.error)
    else await load()
  }

  const filtersActive = projectFilter !== 'all' || priorityFilter !== 'all' || ownershipFilter !== 'all' || search.trim() !== ''
  const totalShown = Object.values(tasksByStatus).reduce((sum, tasks) => sum + tasks.length, 0)

  return (
    <Page>
      <PageHeader
        eyebrow="TASKS / TEAM BOARD"
        title="Tasks"
        description="Every task inside projects your account is authorized to access. Filtering and search run in the database; each column pages through its own results."
        action={
          can('task.create') ? (
            <button className={primaryButtonClassName} onClick={() => setCreateOpen(true)} disabled={!projects.length}>
              <Plus className="h-4 w-4" /> New task
            </button>
          ) : undefined
        }
      />
      {error && <InlineAlert>{error}</InlineAlert>}

      {loading ? (
        <Panel><LoadingState label="Loading tasks…" /></Panel>
      ) : !projects.length ? (
        <Panel>
          <EmptyState
            icon={CheckSquare}
            title="No accessible projects"
            description={can('project.create') ? 'Create a project before adding tasks.' : 'A manager must assign a project to your account.'}
          />
        </Panel>
      ) : totalShown === 0 && !filtersActive ? (
        <Panel>
          <EmptyState
            icon={CheckSquare}
            title="No tasks yet"
            description="Create the first task for an accessible project."
            action={
              can('task.create') ? (
                <button className={primaryButtonClassName} onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> New task
                </button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center" role="group" aria-label="Task filters">
            <div className="relative w-full sm:max-w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                className={`${inputClassName} pl-9`}
                placeholder="Search tasks…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search tasks"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg"
                  aria-label="Clear task search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <select aria-label="Filter by project" className={`${inputClassName} sm:max-w-56`} value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select aria-label="Filter by priority" className={`${inputClassName} sm:max-w-44`} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | TaskPriority)}>
              <option value="all">All priorities</option>
              {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((value) => (
                <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>
              ))}
            </select>
            <select aria-label="Filter by assignee" className={`${inputClassName} sm:max-w-44`} value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value as OwnershipFilter)}>
              <option value="all">Everyone</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                className="text-xs font-medium text-text-secondary hover:text-accent"
                onClick={() => {
                  setProjectFilter('all')
                  setPriorityFilter('all')
                  setOwnershipFilter('all')
                  setSearch('')
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {totalShown === 0 ? (
            <Panel>
              <EmptyState icon={CheckSquare} title="No tasks match these filters" description="Adjust or clear the filters to see more of the board." />
            </Panel>
          ) : (
            <div className="grid gap-4 xl:grid-cols-4">
              {columns.map((column) => {
                const tasks = tasksByStatus[column.id]
                const total = totalsByStatus[column.id]
                return (
                  <Panel key={column.id} title={`${column.label} · ${total}`}>
                    <div className="space-y-3 p-3">
                      {tasks.length === 0 ? (
                        <p className="p-4 text-center text-xs text-text-tertiary">No tasks</p>
                      ) : (
                        tasks.map((task) => {
                          const overdue = isOpenTask(task) && taskDueState(task.due_date) === 'overdue'
                          return (
                            <article
                              key={task.id}
                              className="cursor-pointer rounded-md border border-border bg-surface-raised p-4 transition hover:border-line-light"
                              role="button"
                              tabIndex={0}
                              onClick={() => setDetailTaskId(task.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setDetailTaskId(task.id)
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold leading-snug">{task.title}</p>
                                {(can('task.delete') || task.created_by === user?.id) && (
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void remove(task)
                                    }}
                                    className="shrink-0 text-text-tertiary hover:text-red-400"
                                    aria-label={`Delete ${task.title}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="mt-2 text-xs text-text-tertiary">
                                <Link
                                  href={`/projects/${task.project_id}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="hover:text-accent"
                                >
                                  {task.projects?.name || 'Project unavailable'}
                                </Link>
                              </p>
                              <p className="mt-1 text-xs text-text-tertiary">{task.profiles?.full_name || task.profiles?.email || 'Unassigned'}</p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${taskPriorityBadgeClass(task.priority)}`}>
                                  {TASK_PRIORITY_LABELS[task.priority]}
                                </span>
                                <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${taskDueBadgeClass(task)}`}>
                                  {overdue ? 'Overdue · ' : ''}{formatTaskDueDate(task.due_date)}
                                </span>
                              </div>
                              <div className="mt-4 flex items-center gap-2">
                                <select
                                  className={`${inputClassName} py-2 text-xs`}
                                  value={task.status}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => void move(task, event.target.value as TaskStatus)}
                                  aria-label={`Move ${task.title}`}
                                >
                                  {columns.map((option) => (
                                    <option key={option.id} value={option.id}>{option.label}</option>
                                  ))}
                                </select>
                                <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                              </div>
                            </article>
                          )
                        })
                      )}
                      {tasks.length < total && (
                        <button
                          type="button"
                          onClick={() => void loadMore(column.id)}
                          disabled={loadingMore === column.id}
                          className="w-full rounded-md border border-dashed border-line-light py-2 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {loadingMore === column.id ? 'Loading…' : `Show more (${total - tasks.length} remaining)`}
                        </button>
                      )}
                    </div>
                  </Panel>
                )
              })}
            </div>
          )}
        </>
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projects={projects}
          onClose={() => setDetailTaskId(null)}
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
