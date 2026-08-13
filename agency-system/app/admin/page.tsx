'use client'

import Link from 'next/link'
import { ClipboardList, FolderKanban, ImageIcon, Inbox, KeyRound, Settings2, UserRound, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { AdminSectionNav } from '@/components/admin/admin-section-nav'
import { EmptyState, Page, PageHeader, Panel, secondaryButtonClassName } from '@/components/ui/page'

const areas = [
  { href: '/admin/team', title: 'Team', description: 'Employee profiles, status, and job assignments.', icon: Users, allowed: (can: (p: string) => boolean) => can('employee.manage') || can('employee.edit') },
  { href: '/admin/access', title: 'Access', description: 'Roles, permissions, and capability assignments.', icon: KeyRound, allowed: (can: (p: string) => boolean) => can('role.view') || can('role.assign_permissions') || can('permission.view') || can('permission.manage') },
  { href: '/admin/forms', title: 'Forms', description: 'Form inventory and publishing controls.', icon: ClipboardList, allowed: (can: (p: string) => boolean) => can('form.view') || can('form.manage') },
  { href: '/admin/submissions', title: 'Submissions', description: 'Review, assign, and convert incoming work.', icon: Inbox, allowed: (can: (p: string) => boolean) => can('submission.view') },
  { href: '/admin/portfolio', title: 'Portfolio', description: 'Public portfolio publishing and ordering.', icon: ImageIcon, allowed: (can: (p: string) => boolean) => can('portfolio.manage') },
  { href: '/admin/clients', title: 'Clients', description: 'Client records and relationships.', icon: UserRound, allowed: (can: (p: string) => boolean) => can('client.view') },
  { href: '/admin/projects', title: 'Projects', description: 'Project delivery, ownership, and assignments.', icon: FolderKanban, allowed: (can: (p: string) => boolean) => can('project.view') },
  { href: '/admin/operations', title: 'Operations', description: 'Job roles and cross-workspace operational controls.', icon: Settings2, allowed: (can: (p: string) => boolean) => can('admin.manage') || can('project.assign') || can('role.create') },
]

export default function AdminPage() {
  const { can } = useAuth()
  const visible = areas.filter((area) => area.allowed(can))
  return <Page><PageHeader eyebrow="ADMIN / OVERVIEW" title="Administration" description="Choose a focused area. Each area applies its own permission checks and loads its own workspace data." /><AdminSectionNav />
    {visible.length === 0 ? <Panel><EmptyState icon={KeyRound} title="Administration permission required" description="Ask an administrator for the specific capability you need." /></Panel> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(({ href, title, description, icon: Icon }) => <Panel key={href} className="flex flex-col p-5"><Icon className="h-5 w-5 text-accent" /><h2 className="mt-5 text-base font-semibold text-fg">{title}</h2><p className="mt-2 flex-1 text-xs leading-5 text-text-tertiary">{description}</p><Link href={href} className={`${secondaryButtonClassName} mt-5 self-start`}>Open {title}</Link></Panel>)}</section>}
  </Page>
}
