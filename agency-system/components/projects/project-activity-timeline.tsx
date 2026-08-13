'use client'

import { useEffect, useMemo, useState } from 'react'
import { History, LoaderCircle, ShieldCheck } from 'lucide-react'
import { getProjectActivity, getProjectTaskActivity } from '@/lib/db'
import type { ProjectActivity, TaskActivity } from '@/lib/supabase/types'
import {
  PROJECT_ACTIVITY_LABELS,
  feedActorName,
  formatActivityTime,
  mergeProjectActivity,
  projectEventSummary,
  taskEventSummary,
  type ProjectFeedEntry,
} from '@/lib/project-activity'
import { EmptyState, InlineAlert, Panel } from '@/components/ui/page'

function actorInitials(entry: ProjectFeedEntry): string {
  const name = feedActorName(entry.actor)
  if (name === 'System') return 'SY'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Human sentence for the "what happened" part of an entry. */
function entrySummary(entry: ProjectFeedEntry): string {
  return entry.source === 'project' ? projectEventSummary(entry) : taskEventSummary(entry)
}

/** Small machine-readable context line (ids / file types), kept subtle. */
function entryContext(entry: ProjectFeedEntry): string {
  if (entry.source === 'project') {
    if (entry.event_type === 'submission_converted' && entry.metadata.source_submission_id) {
      return `submission ${String(entry.metadata.source_submission_id).slice(0, 8)}`
    }
    return ''
  }
  return entry.task_id ? `task ${entry.task_id.slice(0, 8)}` : ''
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime().toString()
}

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * The unified project activity & audit timeline: merges project-level events
 * with task-level events into one newest-first feed. Each entry shows who
 * acted, what happened, when, and any relevant context. This is an internal
 * audit view — client-facing comments live separately and never appear here.
 */
export function ProjectActivityTimeline({ projectId }: { projectId: string }) {
  const [projectActivity, setProjectActivity] = useState<ProjectActivity[]>([])
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([getProjectActivity(projectId), getProjectTaskActivity(projectId)]).then(
      ([projectResult, taskResult]) => {
        if (!active) return
        setProjectActivity(projectResult.data)
        setTaskActivity(taskResult.data)
        setError(projectResult.error || taskResult.error || '')
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [projectId])

  const feed = useMemo(() => mergeProjectActivity(projectActivity, taskActivity), [projectActivity, taskActivity])

  const groups = useMemo(() => {
    const now = new Date()
    const order: string[] = []
    const map = new Map<string, ProjectFeedEntry[]>()
    for (const entry of feed) {
      const key = dayKey(entry.created_at)
      if (!map.has(key)) {
        map.set(key, [])
        order.push(key)
      }
      map.get(key)!.push(entry)
    }
    // Preserve the sorted order already established by mergeProjectActivity.
    order.sort((a, b) => Number(b) - Number(a))
    return order.map((key) => ({ label: dayLabel(map.get(key)![0].created_at, now), entries: map.get(key)! }))
  }, [feed])

  return (
    <Panel
      title="Activity & audit timeline"
      description="A unified, append-only history of this project. Each entry shows who acted, what changed, and when. Audit events are kept separate from client-facing comments."
    >
      {error && <InlineAlert>{error}</InlineAlert>}
      {loading ? (
        <LoadingTimeline />
      ) : feed.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity yet"
          description="Project-level changes and task updates will appear here as they happen."
        />
      ) : (
        <div className="p-5">
          {groups.map((group) => (
            <div key={group.label} className="mb-6 last:mb-0">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{group.label}</p>
              <ol className="space-y-4 border-l border-border pl-4">
                {group.entries.map((entry) => (
                  <li key={`${entry.source}-${entry.id}`} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1 flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-bold ${
                        entry.source === 'project'
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-border bg-surface-raised text-text-tertiary'
                      }`}
                      aria-hidden
                    >
                      {entry.source === 'project' ? 'P' : 'T'}
                    </span>
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-[10px] font-semibold text-text-secondary">
                        {actorInitials(entry)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold text-fg">{feedActorName(entry.actor)}</span>
                          <span className="rounded border border-border px-1.5 py-px text-[9px] font-mono-tech uppercase text-text-tertiary">
                            {entry.source === 'project' ? PROJECT_ACTIVITY_LABELS[entry.event_type] : `task · ${entry.event_type}`}
                          </span>
                          <span className="text-[10px] text-text-tertiary/70">· {formatActivityTime(entry.created_at)}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-text-secondary">{entrySummary(entry)}</p>
                        {entry.source === 'project' && entry.event_type === 'submission_converted' && (
                          <p className="mt-1 text-[10px] text-text-tertiary">
                            This project was created from a form submission.
                          </p>
                        )}
                        {entryContext(entry) && (
                          <p className="mt-0.5 text-[10px] font-mono text-text-tertiary/60">{entryContext(entry)}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <p className="mt-6 flex items-center gap-1.5 border-t border-border pt-3 text-[10px] text-text-tertiary">
            <ShieldCheck className="h-3 w-3" /> Immutable audit log — client-facing comments are kept in a separate space.
          </p>
        </div>
      )}
    </Panel>
  )
}

function LoadingTimeline() {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-sm text-text-secondary">
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> Loading activity…
    </div>
  )
}
