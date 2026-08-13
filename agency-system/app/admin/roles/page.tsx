'use client'

import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { RolesPermissionsAdmin } from '@/components/admin/roles-permissions'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'
import { AdminSectionNav } from '@/components/admin/admin-section-nav'

export default function AdminRolesPage() {
  const { can } = useAuth()
  const allowed = can('role.view') || can('role.assign_permissions') || can('permission.view') || can('permission.manage')

  if (!allowed) {
    return (
      <Page>
        <PageHeader eyebrow="ADMIN / ROLES" title="Roles & permissions" description="Review and assign capabilities." />
        <Panel>
          <EmptyState
            icon={ShieldCheck}
            title="Role permission required"
            description="Ask an administrator to grant a Roles & permissions capability. You do not need the full system-admin permission."
          />
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / ROLES & PERMISSIONS"
        title="Roles & permissions"
        description="Checked boxes are what the database enforces. Custom roles start with nothing until you tick a capability."
      />
      <AdminSectionNav />
      <RolesPermissionsAdmin />
    </Page>
  )
}
