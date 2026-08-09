'use client'

import Link from 'next/link'
import { UserCog } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { TeamDirectory } from '@/components/team/team-directory'
import { Page, PageHeader, secondaryButtonClassName } from '@/components/ui/page'

export default function TeamPage() {
  const { can } = useAuth()
  const canManage = can('employee.manage') || can('admin.manage')

  return (
    <Page>
      <PageHeader
        eyebrow="PEOPLE / TEAM DIRECTORY"
        title="Team"
        description="Browse the internal team directory — profile, role, department, and bio for every active team member. Client accounts never appear here."
        action={canManage ? (
          <Link href="/admin/team" className={secondaryButtonClassName}>
            <UserCog className="h-4 w-4" /> Manage team
          </Link>
        ) : undefined}
      />
      <TeamDirectory />
    </Page>
  )
}
