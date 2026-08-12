'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardList, LogOut, Sparkles, UserRound, Zap } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getClientFormSubmissions } from '@/lib/supabase/database'
import type { ClientFormSubmission } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Panel, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  archived: 'Archived',
}

export default function ClientPortalPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading, signOut } = useAuth()
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
      const result = await getClientFormSubmissions()
      if (cancelled) return
      setSubmissions(result.data)
      setError(result.error || '')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [authLoading, router, user])

  const leave = async () => {
    await signOut()
    router.replace('/auth')
  }

  const displayName = profile?.full_name || submissions[0]?.respondent_name || profile?.email || 'Client'
  const companyName = submissions.find((item) => item.company_name)?.company_name

  return (
    <main className="min-h-screen bg-bg pb-16">
      <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center border border-line-light bg-surface-raised">
              <Zap className="h-4 w-4 text-accent" />
            </div>
            <span className="font-mono-tech text-[10px] text-text-tertiary">AGENCY OS / CLIENT PORTAL</span>
          </div>
          <button onClick={() => void leave()} className={secondaryButtonClassName}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>

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
            {companyName ? `${companyName} · ` : ''}Track the service requests linked to your account.
          </p>
        </header>

        {error && <InlineAlert>{error}</InlineAlert>}

        <Panel title="Your requests" description="Every Dynamic Form response submitted for your account.">
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
                const submitted = submission.status === 'submitted'
                const when = submission.submitted_at || submission.created_at
                return (
                  <div key={submission.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">
                        {submission.form_templates?.title || 'Service request'}
                      </p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {submission.company_name || submission.respondent_name || 'Request'} · {new Date(when).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`inline-flex w-fit items-center rounded border px-2.5 py-1 text-[11px] font-semibold ${
                      submitted
                        ? 'border-green-500/30 bg-green-500/5 text-green-400'
                        : submission.status === 'archived'
                          ? 'border-border text-text-tertiary'
                          : 'border-blue-500/30 bg-blue-500/5 text-blue-400'
                    }`}>
                      {statusLabels[submission.status] || submission.status}
                    </span>
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
    </main>
  )
}
