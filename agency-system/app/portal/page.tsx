'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ClipboardList, FolderKanban, LoaderCircle, Sparkles, Timer, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  getClientFormSubmissions,
  getClientPortalClient,
  getClientPortalProjects,
} from '@/lib/supabase/database'
import type { ClientFormSubmission, ClientPortalClient, ClientPortalProject } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Panel, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { Progress } from '@/components/ui/progress'
import { PROJECT_STATUS_LABELS, projectStatusBadgeClass } from '@/lib/project-lifecycle'
import { SUBMISSION_STATUS_LABELS, submissionStatusStyle } from '@/lib/submissions'

type Summary = {
  total: number
  inProgress: number
  waitingOnClient: number
  completed: number
}

const IN_PROGRESS_STATUSES = new Set(['draft', 'planned', 'active', 'in-review', 'ready-for-delivery', 'delivered'])

export default function ClientPortalPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  const [client, setClient] = useState<ClientPortalClient | null>(null)
  const [projects, setProjects] = useState<ClientPortalProject[]>([])
  const [submissions, setSubmissions] = useState<ClientFormSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/auth')
      return
    }
    let cancelled = false
    void (async () => {
      const [clientResult, projectsResult, submissionsResult] = await Promise.all([
        getClientPortalClient(),
        getClientPortalProjects(),
        getClientFormSubmissions(),
      ])
      if (cancelled) return
      setClient(clientResult.data)
      setProjects(projectsResult.data)
      setSubmissions(submissionsResult.data)
      setError(clientResult.error || projectsResult.error || submissionsResult.error || '')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [authLoading, router, user])

  const displayName = profile?.full_name || client?.contact_person || profile?.email || 'Client'
  const companyName = client?.name || submissions.find((item) => item.company_name)?.company_name

  const summary: Summary = {
    total: projects.length,
    inProgress: projects.filter((project) => IN_PROGRESS_STATUSES.has(project.status)).length,
    waitingOnClient: projects.filter((project) => project.status === 'waiting-for-client').length,
    completed: projects.filter((project) => project.status === 'completed').length,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-8">
      <header className="border-b border-border pb-7">
        <div className="mb-3 flex items-center gap-3 font-mono-tech text-[10px] text-text-tertiary">
          <span className="h-px w-7 bg-accent" />
          CLIENT ACCOUNT
        </div>
        <h1 className="font-display text-5xl leading-none tracking-tight text-fg sm:text-6xl">
          Welcome, {displayName.split(' ')[0]}<span className="text-text-tertiary">.</span>
        </h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
          <UserRound className="h-4 w-4 text-accent" />
          {companyName ? `${companyName} · ` : ''}Your projects and requests, in one place.
        </p>
      </header>

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={FolderKanban} label="Projects" value={summary.total} />
        <StatCard icon={LoaderCircle} label="In progress" value={summary.inProgress} />
        <StatCard icon={Timer} label="Needs your input" value={summary.waitingOnClient} />
        <StatCard icon={CheckCircle2} label="Completed" value={summary.completed} />
      </div>

      <Panel title="Your projects" description="Every project owned by your account, with its current stage.">
        {loading ? (
          <LoadingState label="Loading your projects…" />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="When your agency starts work for you, it will appear here with its live status."
          />
        ) : (
          <div className="divide-y divide-border">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/portal/projects/${project.id}`}
                className="block px-5 py-4 transition-colors hover:bg-surface-raised"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-fg">{project.name}</p>
                      {project.reference_number && (
                        <span className="font-mono-tech rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-accent">
                          {project.reference_number}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {project.type}
                      {project.due_date ? ` · due ${new Date(project.due_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit shrink-0 items-center rounded border px-2.5 py-1 text-[11px] font-semibold ${projectStatusBadgeClass(project.status)}`}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={project.progress} className="h-1.5" />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-text-tertiary">{project.progress}%</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Your requests" description="Service requests submitted for your account.">
        {loading ? (
          <LoadingState label="Loading your requests…" />
        ) : submissions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No requests yet"
            description="Submit your first service request and it will appear here with its live status."
            action={<Link href="/forms" className={primaryButtonClassName}><Sparkles className="h-4 w-4" /> Request a New Project</Link>}
          />
        ) : (
          <div className="divide-y divide-border">
            {submissions.map((submission) => {
              const when = submission.submitted_at || submission.created_at
              return (
                <div key={submission.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-fg">
                        {submission.form_templates?.title || 'Service request'}
                      </p>
                      {submission.reference_number && (
                        <span className="font-mono-tech rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-accent">
                          {submission.reference_number}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {submission.company_name || submission.respondent_name || 'Request'} · {new Date(when).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex w-fit items-center rounded border px-2.5 py-1 text-[11px] font-semibold ${submissionStatusStyle(submission.status)}`}>
                      {SUBMISSION_STATUS_LABELS[submission.status as keyof typeof SUBMISSION_STATUS_LABELS] || submission.status}
                    </span>
                    {submission.reference_number && (
                      <Link
                        href={`/track?ref=${encodeURIComponent(submission.reference_number)}`}
                        className="inline-flex items-center rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-secondary hover:border-line-light hover:text-fg"
                      >
                        Track
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <Sparkles className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <h2 className="text-sm font-semibold">Need something new?</h2>
            <p className="mt-1 text-xs text-text-tertiary">Start a new project request from the published forms — it will be linked to this account automatically.</p>
          </div>
        </div>
        <Link href="/forms" className={secondaryButtonClassName}>Request a New Project</Link>
      </Panel>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof FolderKanban; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <Icon className="h-4 w-4 text-accent" />
      <p className="mt-3 font-display text-3xl leading-none text-fg">{value}</p>
      <p className="mt-1 text-xs text-text-tertiary">{label}</p>
    </div>
  )
}
