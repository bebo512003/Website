'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, FolderKanban, Hash, Layers, Type } from 'lucide-react'
import { getClientPortalProject } from '@/lib/db'
import type { ClientPortalProject } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Panel, secondaryButtonClassName } from '@/components/ui/page'
import { Progress } from '@/components/ui/progress'
import { PROJECT_STATUS_LABELS, projectStatusBadgeClass } from '@/lib/project-lifecycle'

/**
 * Client-facing project detail. Project fields come from the sanitized
 * `get_client_portal_project` RPC — no owner, manager, team, budget, health,
 * priority, or internal audit fields are exposed to clients.
 */
export default function ClientPortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<ClientPortalProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [projectResult] = await Promise.all([getClientPortalProject(id)])
    setProject(projectResult.data)
    setError(projectResult.error || '')
    setLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await load()
      if (cancelled) return
    })()
    return () => { cancelled = true }
  }, [load])

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <div>
        <Link href="/portal" className="inline-flex items-center gap-2 text-xs text-text-tertiary hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to your projects
        </Link>
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}

      {loading ? (
        <Panel><LoadingState label="Loading project…" /></Panel>
      ) : !project ? (
        <Panel>
          <EmptyState
            icon={FolderKanban}
            title="Project not found"
            description="This project does not exist or is not linked to your account."
            action={<Link href="/portal" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Your projects</Link>}
          />
        </Panel>
      ) : (
        <>
          <header className="border-b border-border pb-6">
            <div className="mb-3 flex items-center gap-3 font-mono-tech text-[10px] text-text-tertiary">
              <span className="h-px w-7 bg-accent" />
              PROJECT
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl leading-none tracking-tight text-fg">{project.name}</h1>
              <span className={`inline-flex items-center rounded border px-2.5 py-1 text-[11px] font-semibold ${projectStatusBadgeClass(project.status)}`}>
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
            </div>
            {project.reference_number && (
              <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                <Hash className="h-3.5 w-3.5 text-accent" />
                Request reference
                <Link
                  href={`/track?ref=${encodeURIComponent(project.reference_number)}`}
                  className="font-mono-tech text-accent hover:underline"
                >
                  {project.reference_number}
                </Link>
              </p>
            )}
          </header>

          <Panel title="Progress">
            <div className="p-5">
              <div className="flex items-center gap-4">
                <Progress value={project.progress} className="h-2.5" />
                <span className="font-display text-2xl tabular-nums text-fg">{project.progress}%</span>
              </div>
              <p className="mt-3 text-xs text-text-tertiary">
                {project.phase_name ? `Phase ${project.phase} — ${project.phase_name}` : `Phase ${project.phase}`}
              </p>
            </div>
          </Panel>

          <div className="grid gap-5 sm:grid-cols-2">
            <Panel title="Details">
              <dl className="divide-y divide-border text-sm">
                <DetailRow icon={Type} label="Type" value={project.type} />
                <DetailRow
                  icon={CalendarDays}
                  label="Started"
                  value={project.start_date ? new Date(project.start_date).toLocaleDateString() : 'Not set'}
                />
                <DetailRow
                  icon={CalendarDays}
                  label="Due"
                  value={project.due_date ? new Date(project.due_date).toLocaleDateString() : 'Not set'}
                />
                <DetailRow icon={Layers} label="Current stage" value={PROJECT_STATUS_LABELS[project.status]} />
              </dl>
            </Panel>

            <Panel title="About this project">
              <div className="p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {project.description || 'No description has been shared for this project yet.'}
                </p>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Type; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="flex items-center gap-2 text-xs text-text-tertiary">
        <Icon className="h-3.5 w-3.5 text-accent" /> {label}
      </span>
      <span className="text-right text-sm font-semibold text-fg">{value}</span>
    </div>
  )
}
