'use client'

import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { TeamManagement } from '@/components/admin/team-management'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function TeamPage() {
  const { can } = useAuth()
  const allowed = can('employee.manage') || can('employee.edit')

  if (!allowed) {
    return (
      <Page>
        <PageHeader eyebrow="ADMIN / TEAM" title="Team Management" description="Manage your internal team members." />
        <Panel>
          <EmptyState
            icon={ShieldCheck}
            title="Team management permission required"
            description="Ask an administrator to grant “Manage employees” or “Edit employees”. You do not need the full system-admin permission."
          />
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / TEAM MANAGEMENT"
        title="Team Management"
        description="View all team members, add new members, edit, activate/deactivate, and assign roles. This area follows employee.manage — not admin.manage."
      />
      <TeamManagement />
    </Page>
  )
}
