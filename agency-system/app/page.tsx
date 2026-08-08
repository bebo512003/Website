'use client'

import Link from 'next/link'
import { ArrowRight, FolderKanban, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Page, PageHeader, Panel } from '@/components/ui/page'

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth()

  return (
    <Page>
      <PageHeader eyebrow="DASHBOARD / OVERVIEW" title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`} description="Your live workspace will show only information that your role is allowed to access." />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-6">
          <FolderKanban className="h-6 w-6 text-accent" />
          <h2 className="mt-5 text-lg font-semibold">Projects</h2>
          <p className="mt-2 text-sm text-text-tertiary">Open your authorized project portfolio and assignments.</p>
          <Link href="/projects" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent">View projects <ArrowRight className="h-4 w-4" /></Link>
        </Panel>
        {isAdmin && <Panel className="p-6"><ShieldCheck className="h-6 w-6 text-accent" /><h2 className="mt-5 text-lg font-semibold">Administration</h2><p className="mt-2 text-sm text-text-tertiary">Manage user roles, assignments, and projects.</p><Link href="/admin" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent">Open administration <ArrowRight className="h-4 w-4" /></Link></Panel>}
      </div>
    </Page>
  )
}
