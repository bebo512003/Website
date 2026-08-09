'use client'

import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { TeamManagement } from '@/components/admin/team-management'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function TeamPage() {
  const { isAdmin } = useAuth()

  if (!isAdmin) {
    return (
      <Page>
        <PageHeader eyebrow="ADMIN / TEAM" title="Team Management" description="Manage your internal team members." />
        <Panel>
          <EmptyState icon={ShieldCheck} title="Administrator access required" description="Your current role cannot manage team members." />
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / TEAM MANAGEMENT"
        title="Team Management"
        description="View all team members, add new members, edit, activate/deactivate, assign roles from the dynamic Role system, and view detailed profiles. Team members are always Employee/Internal Users, never Clients."
      />
      <TeamManagement />
    </Page>
  )
}
