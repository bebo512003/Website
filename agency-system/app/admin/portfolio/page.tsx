'use client'

import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { PortfolioManagement } from '@/components/admin/portfolio-management'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'
import { AdminSectionNav } from '@/components/admin/admin-section-nav'

export default function AdminPortfolioPage() {
  const { can } = useAuth()

  if (!can('portfolio.manage')) {
    return (
      <Page>
        <PageHeader eyebrow="ADMIN / PORTFOLIO" title="Portfolio" description="Manage the public company portfolio." />
        <Panel>
          <EmptyState
            icon={ShieldCheck}
            title="Portfolio permission required"
            description="Ask an administrator to grant “Manage portfolio”. You do not need the full system-admin permission."
          />
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / PORTFOLIO"
        title="Portfolio"
        description="Anyone with Manage portfolio can publish, archive, and reorder public work. This page is not locked behind Manage system."
      />
      <AdminSectionNav />
      <PortfolioManagement />
    </Page>
  )
}
