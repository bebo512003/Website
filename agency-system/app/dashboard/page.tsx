'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bell, CheckCircle2, FolderKanban, Plus, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getClients, getNotifications, getProjects, getTasks } from '@/lib/db'
import type { Notification, ProjectWithClient, TaskWithRelations } from '@/lib/supabase/types'
import { PROJECT_STATUS_LABELS } from '@/lib/project-lifecycle'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

export default function DashboardPage() {
  const { profile, can } = useAuth()
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [clientCount, setClientCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [projectResult, taskResult, clientResult, notificationResult] = await Promise.all([getProjects(), getTasks(), getClients(), getNotifications(5)])
    setProjects(projectResult.data); setTasks(taskResult.data); setClientCount(clientResult.data.length); setNotifications(notificationResult.data)
    setError(projectResult.error || taskResult.error || clientResult.error || notificationResult.error || ''); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const metrics = useMemo(() => [
    { label: 'Accessible projects', value: projects.length, icon: FolderKanban },
    { label: 'Active projects', value: projects.filter((project) => project.status === 'active').length, icon: FolderKanban },
    { label: 'Completed tasks', value: tasks.filter((task) => task.status === 'done').length, icon: CheckCircle2 },
    { label: 'Accessible clients', value: clientCount, icon: Users },
  ], [clientCount, projects, tasks])

  return <Page><PageHeader eyebrow="DASHBOARD / LIVE OVERVIEW" title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`} description="Every number below is loaded from Supabase and filtered by your database permissions." action={can('project.create') ? <Link href="/projects" className={primaryButtonClassName}><Plus className="h-4 w-4" />Manage projects</Link> : undefined} />{error && <InlineAlert>{error}</InlineAlert>}{loading ? <Panel><LoadingState label="Loading workspace…" /></Panel> : <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <Panel key={label} className="p-5"><Icon className="h-5 w-5 text-accent" /><p className="mt-6 font-display text-5xl leading-none">{value}</p><p className="mt-2 text-xs text-text-tertiary">{label}</p></Panel>)}</section><div className="grid gap-5 xl:grid-cols-[1fr_380px]"><Panel title="Recent projects" description="Your five most recently created accessible projects">{projects.length === 0 ? <EmptyState icon={FolderKanban} title="No accessible projects" description={can('project.create') ? 'Create a client and project to begin.' : 'A manager must assign a project to your account.'} /> : <div className="divide-y divide-border">{projects.slice(0, 5).map((project) => <Link href={`/projects/${project.id}`} key={project.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{project.name}</span><span className="mt-1 block truncate text-xs text-text-tertiary">{project.clients?.name || 'No client'} · {PROJECT_STATUS_LABELS[project.status]}</span></span><span className="text-sm font-semibold text-accent">{project.progress}%</span></Link>)}</div>}<div className="border-t border-border p-4"><Link href="/projects" className={secondaryButtonClassName}>View all projects<ArrowRight className="h-4 w-4" /></Link></div></Panel><Panel title="Notifications" description="Your latest private updates">{notifications.length === 0 ? <EmptyState icon={Bell} title="No notifications" description="Assignments and project updates will appear here." /> : <div className="divide-y divide-border">{notifications.map((notification) => <Link href={notification.action_url || '/notifications'} key={notification.id} className="block px-5 py-4 hover:bg-surface-raised"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${notification.read_at ? 'bg-border' : 'bg-accent'}`} /><span className="text-sm font-semibold">{notification.title}</span></div><p className="ml-3.5 mt-1 line-clamp-2 text-xs text-text-tertiary">{notification.message}</p></Link>)}</div>}<div className="border-t border-border p-4"><Link href="/notifications" className={secondaryButtonClassName}>Open inbox<ArrowRight className="h-4 w-4" /></Link></div></Panel></div>{can('admin.manage') && <Panel className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-accent" /><div><h2 className="text-sm font-semibold">Administrator controls</h2><p className="mt-1 text-xs text-text-tertiary">Manage user roles, permissions, and employee project assignments.</p></div></div><Link href="/admin" className={secondaryButtonClassName}>Open administration<ArrowRight className="h-4 w-4" /></Link></Panel>}</>}</Page>
}
