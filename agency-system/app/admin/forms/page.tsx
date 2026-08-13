'use client'

import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { FormsAdmin } from '@/components/admin/forms-admin'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'
import { AdminSectionNav } from '@/components/admin/admin-section-nav'

export default function AdminFormsPage() {
  const { can } = useAuth()
  const allowed = can('form.manage') || can('form.view')

  if (!allowed) {
    return (
      <Page>
        <PageHeader eyebrow="ADMIN / FORMS" title="Forms" description="Build and publish Dynamic Forms." />
        <Panel>
          <EmptyState
            icon={ShieldCheck}
            title="Form permission required"
            description="Ask an administrator to grant “View forms” or “Manage forms”. You do not need the full system-admin permission."
          />
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / FORMS"
        title="Forms"
        description="This area opens for anyone with View forms or Manage forms — it is not locked behind Manage system."
      />
      <AdminSectionNav />
      <FormsAdmin />
    </Page>
  )
}
