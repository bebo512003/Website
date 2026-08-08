'use client'

import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function AdminPage() {
  const { isAdmin } = useAuth()
  return <Page><PageHeader eyebrow="ADMIN / ACCESS CONTROL" title="Administration" description="Manage workspace users, roles, project access, and projects." /><Panel><EmptyState icon={ShieldCheck} title={isAdmin ? 'Administration is ready for configuration' : 'Administrator access required'} description={isAdmin ? 'No sample users are shown. Real workspace accounts will be loaded from Supabase.' : 'Your current role cannot manage users or permissions.'} /></Panel></Page>
}
