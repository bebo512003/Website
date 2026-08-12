'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart3, CheckCircle2, Clock, FolderKanban } from 'lucide-react'
import { getProjects, getTasks } from '@/lib/supabase/database'
import type { ProjectWithClient, TaskWithRelations } from '@/lib/supabase/types'
import { PROJECT_STATUS_LABELS } from '@/lib/project-lifecycle'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function ReportsPage() {
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { const [p, t] = await Promise.all([getProjects(), getTasks()]); setProjects(p.data); setTasks(t.data); setError(p.error || t.error || ''); setLoading(false) }, [])
  useEffect(() => { void load() }, [load])
  const summary = useMemo(() => ({ average: projects.length ? Math.round(projects.reduce((total, project) => total + project.progress, 0) / projects.length) : 0, complete: tasks.filter((task) => task.status === 'done').length, open: tasks.filter((task) => task.status !== 'done').length }), [projects, tasks])

  return <Page><PageHeader eyebrow="REPORTS / LIVE DATA" title="Reports" description="Metrics are calculated only from projects and tasks your account can read through RLS." />{error && <InlineAlert>{error}</InlineAlert>}{loading ? <Panel><LoadingState label="Calculating reports…" /></Panel> : !projects.length && !tasks.length ? <Panel><EmptyState icon={BarChart3} title="No report data" description="Metrics will appear when accessible projects and tasks exist." /></Panel> : <><div className="grid gap-4 sm:grid-cols-3"><Panel className="p-5"><FolderKanban className="h-5 w-5 text-accent" /><p className="mt-5 font-display text-5xl">{summary.average}%</p><p className="mt-1 text-xs text-text-tertiary">Average project progress</p></Panel><Panel className="p-5"><CheckCircle2 className="h-5 w-5 text-accent" /><p className="mt-5 font-display text-5xl">{summary.complete}</p><p className="mt-1 text-xs text-text-tertiary">Completed tasks</p></Panel><Panel className="p-5"><Clock className="h-5 w-5 text-accent" /><p className="mt-5 font-display text-5xl">{summary.open}</p><p className="mt-1 text-xs text-text-tertiary">Open tasks</p></Panel></div><Panel title="Project health" description="Current progress for every accessible project"><div className="divide-y divide-border">{projects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="block px-5 py-4 hover:bg-surface-raised"><div className="flex items-center justify-between gap-4"><span><span className="block text-sm font-semibold">{project.name}</span><span className="mt-1 block text-xs text-text-tertiary">{project.clients?.name || 'No client'} · {PROJECT_STATUS_LABELS[project.status]}{project.archived_at ? ' · Archived' : ''}</span></span><span className="text-sm font-semibold">{project.progress}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent" style={{ width: `${project.progress}%` }} /></div></Link>)}</div></Panel></>}</Page>
}
