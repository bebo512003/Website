'use client'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { AdminSectionNav } from '@/components/admin/admin-section-nav'
import { RolesPermissionsAdmin } from '@/components/admin/roles-permissions'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'
export default function AccessPage() { const { can } = useAuth(); const allowed = can('role.view') || can('role.assign_permissions') || can('permission.view') || can('permission.manage'); return <Page><PageHeader eyebrow="ADMIN / ACCESS" title="Access control" description="Roles and permissions are enforced by the database, not role names." /><AdminSectionNav />{allowed ? <RolesPermissionsAdmin /> : <Panel><EmptyState icon={ShieldCheck} title="Access permission required" description="Ask an administrator for a roles or permissions capability." /></Panel>}</Page> }
