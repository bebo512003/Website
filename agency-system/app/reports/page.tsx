'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Inbox,
  ListTodo,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getOperationalAnalytics } from '@/lib/supabase/database'
import type { OperationalAnalytics } from '@/lib/supabase/types'
import { PROJECT_STATUS_LABELS, projectStatusBadgeClass } from '@/lib/project-lifecycle'
import { TASK_PRIORITY_LABELS, taskPriorityBadgeClass } from '@/lib/tasks'
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  Page,
  PageHeader,
  Panel,
  secondaryButtonClassName,
} from '@/components/ui/page'

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
] as const

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`
}

function formatDuration(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  attention = false,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  detail: string
  attention?: boolean
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <Icon className={`h-5 w-5 ${attention ? 'text-orange-400' : 'text-accent'}`} />
        {attention && <span className="rounded border border-orange-500/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-300">Needs action</span>}
      </div>
      <p className="mt-6 font-display text-5xl leading-none text-fg">{value}</p>
      <p className="mt-2 text-xs font-semibold text-text-secondary">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-text-tertiary">{detail}</p>
    </Panel>
  )
}

function changeDescription(current: number, previous: number, change: number | null): string {
  if (change == null) return previous === 0 ? 'No submissions in the prior window' : `${previous} in the prior window`
  if (change === 0) return `Unchanged from the prior window (${previous})`
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs prior window (${previous})`
}

function deliveryVarianceLabel(days: number | null): string {
  if (days == null) return 'No deadline baseline'
  if (days === 0) return 'On the deadline'
  return `${Math.abs(days).toFixed(1)}d ${days < 0 ? 'early' : 'late'}`
}

export default function ReportsPage() {
  const { can } = useAuth()
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<OperationalAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const result = await getOperationalAnalytics(days)
    setReport(result.data)
    setError(result.error || '')
    setLoading(false)
  }, [days])

  useEffect(() => { void load() }, [load])

  const maxTrend = useMemo(
    () => Math.max(1, ...(report?.submissions.trend.map((point) => point.submissions) || [0])),
    [report],
  )
  const maxFormVolume = useMemo(
    () => Math.max(1, ...(report?.submissions.by_form.map((form) => form.submissions) || [0])),
    [report],
  )
  const maxProjectStatus = useMemo(
    () => Math.max(1, ...(report?.projects.by_status.map((item) => item.count) || [0])),
    [report],
  )
  const maxOpenWork = useMemo(
    () => Math.max(1, ...(report?.team_workload.map((person) => person.open_tasks) || [0])),
    [report],
  )

  const windowControl = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-md border border-border bg-surface p-1" role="group" aria-label="Reporting window">
        {WINDOWS.map((window) => (
          <button
            key={window.days}
            type="button"
            onClick={() => setDays(window.days)}
            aria-pressed={days === window.days}
            className={`rounded px-2.5 py-1.5 text-[11px] font-semibold transition ${days === window.days ? 'bg-accent text-accent-foreground' : 'text-text-tertiary hover:text-fg'}`}
          >
            {window.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => void load()} className={`${secondaryButtonClassName} px-3`} disabled={loading} aria-label="Refresh operational report">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )

  return (
    <Page>
      <PageHeader
        eyebrow="REPORTS / OPERATIONAL ANALYTICS"
        title="Agency operations"
        description="Decision-useful reporting from submission, project, task, team, and delivery workflows. Financial reporting is intentionally excluded."
        action={windowControl}
      />

      {error && <InlineAlert>{error}</InlineAlert>}

      {loading && !report ? (
        <Panel><LoadingState label="Calculating operational performance…" /></Panel>
      ) : !report ? (
        <Panel>
          <EmptyState
            icon={BarChart3}
            title="Operational report unavailable"
            description="Connect Supabase, apply the Session 24 migration, and sign in with the View reports permission."
            action={<button type="button" className={secondaryButtonClassName} onClick={() => void load()}>Try again</button>}
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3 text-xs text-text-tertiary sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-semibold text-text-secondary">Windowed:</span> submissions and first deliveries · <span className="font-semibold text-text-secondary">Live snapshot:</span> projects, tasks, and workload
            </p>
            <p className="shrink-0">{formatDate(report.window.start_date)} — {formatDate(report.window.end_date)}</p>
          </div>

          {(!report.scope.all_projects || !report.scope.submissions_included) && (
            <InlineAlert tone="info">
              This report follows your permissions. {!report.scope.all_projects && 'Project, task, workload, and delivery metrics include only projects you can access. '}
              {!report.scope.submissions_included && 'Submission metrics require the View submissions permission.'}
            </InlineAlert>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              icon={Inbox}
              label={`Submission volume · ${report.window.days} days`}
              value={report.scope.submissions_included ? report.submissions.volume : '—'}
              detail={report.scope.submissions_included
                ? changeDescription(report.submissions.volume, report.submissions.previous_volume, report.submissions.volume_change_percent)
                : 'Submission data is outside your permission scope'}
            />
            <MetricCard
              icon={Activity}
              label="Submission conversion"
              value={report.scope.submissions_included ? formatPercent(report.submissions.conversion_rate) : '—'}
              detail={report.scope.submissions_included ? `${report.submissions.converted} of ${report.submissions.volume} submissions became projects` : 'Requires View submissions'}
            />
            <MetricCard
              icon={Clock3}
              label="Median first response"
              value={report.scope.submissions_included ? formatDuration(report.submissions.median_response_hours) : '—'}
              detail={report.scope.submissions_included ? `${report.submissions.responded} handled · ${report.submissions.awaiting_response} awaiting a staff action` : 'Measured from submission to first recorded staff action'}
              attention={report.scope.submissions_included && report.submissions.awaiting_response > 0}
            />
            <MetricCard
              icon={BriefcaseBusiness}
              label="Active projects"
              value={report.projects.active}
              detail={`${report.projects.overdue} project${report.projects.overdue === 1 ? '' : 's'} past deadline · excludes draft, hold, and terminal stages`}
              attention={report.projects.overdue > 0}
            />
            <MetricCard
              icon={ListTodo}
              label="Overdue tasks"
              value={report.tasks.overdue}
              detail={`${report.tasks.open} open · ${report.tasks.unassigned} unassigned · ${report.tasks.due_next_7_days} due in 7 days`}
              attention={report.tasks.overdue > 0 || report.tasks.unassigned > 0}
            />
            <MetricCard
              icon={PackageCheck}
              label="On-time first delivery"
              value={formatPercent(report.delivery.on_time_rate)}
              detail={`${report.delivery.on_time} on time · ${report.delivery.late} late · ${report.delivery.no_deadline} without deadline`}
              attention={report.delivery.late > 0 || report.delivery.no_deadline > 0}
            />
          </section>

          {report.scope.submissions_included ? (
            <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
              <Panel title="Submission volume" description="Received vs converted demand. Conversion follows the submission's real project link, even when conversion happened later.">
                {report.submissions.trend.length === 0 ? (
                  <EmptyState icon={Inbox} title="No submission history" description="Published form responses will appear here." />
                ) : (
                  <div className="p-5">
                    <div className="mb-4 flex items-center gap-4 text-[10px] text-text-tertiary">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />Received</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-400" />Converted</span>
                    </div>
                    <div className="flex h-48 items-end gap-1 border-b border-border pt-4" aria-label="Submission volume chart">
                      {report.submissions.trend.map((point) => {
                        const height = (point.submissions / maxTrend) * 100
                        const convertedHeight = point.submissions > 0 ? (point.converted / point.submissions) * 100 : 0
                        return (
                          <div key={point.period_start} className="group relative flex h-full min-w-1 flex-1 items-end" title={`${formatShortDate(point.period_start)}: ${point.submissions} received, ${point.converted} converted`}>
                            <div className="relative w-full min-w-1 rounded-t-sm bg-accent/70 transition group-hover:bg-accent" style={{ height: `${height}%` }}>
                              {convertedHeight > 0 && <span className="absolute bottom-0 left-0 right-0 bg-emerald-400/90" style={{ height: `${convertedHeight}%` }} />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-2 flex justify-between text-[9px] text-text-tertiary">
                      <span>{formatShortDate(report.submissions.trend[0].period_start)}</span>
                      <span>{formatShortDate(report.submissions.trend[Math.floor(report.submissions.trend.length / 2)].period_start)}</span>
                      <span>{formatShortDate(report.submissions.trend[report.submissions.trend.length - 1].period_start)}</span>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="Submissions by form / service" description="Shows where demand arrives and whether it becomes managed work.">
                {report.submissions.by_form.length === 0 ? (
                  <EmptyState icon={Inbox} title="No submissions in this window" description="Choose a wider window or wait for new form responses." />
                ) : (
                  <div className="divide-y divide-border">
                    {report.submissions.by_form.map((form) => (
                      <div key={form.form_id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-fg">{form.title}</p>
                            <p className="mt-1 text-[11px] text-text-tertiary">{form.converted} converted</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-fg">{form.submissions}</p>
                            <p className="mt-1 text-[10px] text-text-tertiary">{formatPercent(form.conversion_rate)}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(form.submissions / maxFormVolume) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </section>
          ) : (
            <Panel>
              <EmptyState icon={Inbox} title="Submission analytics unavailable" description="Grant View submissions together with View reports to include volume, source, conversion, and response-time data." />
            </Panel>
          )}

          <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <Panel title="Projects by lifecycle status" description="Current, non-archived project pipeline. Active work includes Planned through Delivered.">
              <div className="divide-y divide-border">
                {report.projects.by_status.map((item) => (
                  <div key={item.status} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded border px-2 py-0.5 text-[10px] ${projectStatusBadgeClass(item.status)}`}>{PROJECT_STATUS_LABELS[item.status]}</span>
                      <span className="text-sm font-semibold text-fg">{item.count}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent/80" style={{ width: `${(item.count / maxProjectStatus) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Team workload" description="Open work by assignee. Overdue, near-term, and review counts expose delivery risk without inventing utilization scores.">
              {report.team_workload.length === 0 ? (
                <EmptyState icon={UsersRound} title="No assigned operational work" description="Assign open tasks or active projects to see team workload." />
              ) : (
                <div className="overflow-x-auto" tabIndex={0} aria-label="Scrollable team workload table">
                  <table className="w-full min-w-[720px] text-left">
                    <thead className="border-b border-border bg-surface-raised text-[10px] uppercase tracking-wider text-text-tertiary">
                      <tr>
                        <th className="px-5 py-3 font-medium">Team member</th>
                        <th className="px-3 py-3 text-center font-medium">Projects</th>
                        <th className="px-3 py-3 font-medium">Open tasks</th>
                        <th className="px-3 py-3 text-center font-medium">Due 7d</th>
                        <th className="px-3 py-3 text-center font-medium">Review</th>
                        <th className="px-5 py-3 text-center font-medium">Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.team_workload.map((person) => (
                        <tr key={person.user_id} className="hover:bg-surface-raised/60">
                          <td className="px-5 py-4">
                            {can('employee.view') ? <Link href={`/team/${person.user_id}`} className="text-sm font-semibold text-fg hover:text-accent">{person.name}</Link> : <p className="text-sm font-semibold text-fg">{person.name}</p>}
                            <p className="mt-1 text-[10px] text-text-tertiary">{person.job_title || 'Team member'}</p>
                          </td>
                          <td className="px-3 py-4 text-center text-sm text-text-secondary">{person.active_projects}</td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <span className="w-6 text-right text-sm font-semibold text-fg">{person.open_tasks}</span>
                              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-accent" style={{ width: `${(person.open_tasks / maxOpenWork) * 100}%` }} /></span>
                            </div>
                          </td>
                          <td className="px-3 py-4 text-center text-sm text-text-secondary">{person.due_next_7_days}</td>
                          <td className="px-3 py-4 text-center text-sm text-text-secondary">{person.in_review_tasks}</td>
                          <td className={`px-5 py-4 text-center text-sm font-semibold ${person.overdue_tasks > 0 ? 'text-orange-300' : 'text-text-tertiary'}`}>{person.overdue_tasks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Overdue task queue" description="Oldest open deadlines first. Use this list for reassignment, escalation, or deadline correction.">
              {report.tasks.overdue_items.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="No overdue tasks" description="There are no open tasks past their due date in the current project scope." />
              ) : (
                <div className="divide-y divide-border">
                  {report.tasks.overdue_items.map((task) => (
                    <Link key={task.id} href={`/projects/${task.project_id}`} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-surface-raised sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-fg">{task.title}</p>
                          <span className={`rounded border px-2 py-0.5 text-[9px] font-semibold ${taskPriorityBadgeClass(task.priority)}`}>{TASK_PRIORITY_LABELS[task.priority]}</span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-text-tertiary">{task.project_name} · {task.assignee_name}</p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-sm font-semibold text-orange-300">{task.days_overdue}d overdue</p>
                        <p className="mt-1 text-[10px] text-text-tertiary">Due {formatDate(task.due_date)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Delivery performance" description="First delivery per project in the selected window, compared with the project's recorded deadline.">
              {report.delivery.delivered === 0 ? (
                <EmptyState icon={PackageCheck} title="No first deliveries in this window" description="Choose a wider window or complete a delivery handoff to build the baseline." />
              ) : (
                <div className="p-5">
                  <div className="flex items-end justify-between gap-4 border-b border-border pb-5">
                    <div>
                      <p className="font-display text-6xl leading-none text-fg">{formatPercent(report.delivery.on_time_rate)}</p>
                      <p className="mt-2 text-xs text-text-tertiary">On-time across {report.delivery.scheduled} scheduled first deliveries</p>
                    </div>
                    <PackageCheck className="h-7 w-7 text-accent" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 py-5">
                    {[
                      ['First deliveries', report.delivery.delivered],
                      ['On time', report.delivery.on_time],
                      ['Late', report.delivery.late],
                      ['No deadline', report.delivery.no_deadline],
                      ['Revision projects', report.delivery.revision_projects],
                      ['Median cycle', report.delivery.median_cycle_days == null ? '—' : `${report.delivery.median_cycle_days.toFixed(1)}d`],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-md border border-border bg-surface-raised p-3">
                        <p className="text-lg font-semibold text-fg">{value}</p>
                        <p className="mt-1 text-[10px] text-text-tertiary">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
                    <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${report.delivery.median_variance_days != null && report.delivery.median_variance_days > 0 ? 'text-orange-300' : 'text-text-tertiary'}`} />
                    <div>
                      <p className="text-xs font-semibold text-fg">Median deadline variance: {deliveryVarianceLabel(report.delivery.median_variance_days)}</p>
                      <p className="mt-1 text-[10px] leading-4 text-text-tertiary">Based on the current project deadline and the first recorded delivery timestamp. Projects without deadlines are reported separately.</p>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </section>
        </>
      )}
    </Page>
  )
}
