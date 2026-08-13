'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, FolderKanban, ImageIcon, Inbox, KeyRound, LayoutDashboard, Settings2, UserRound, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'

const sections = [
  { href: '/admin/overview', label: 'Overview', icon: LayoutDashboard, allowed: (can: (p: string) => boolean) => can('admin.manage') || can('employee.manage') || can('form.view') || can('portfolio.manage') },
  { href: '/admin/team', label: 'Team', icon: Users, allowed: (can: (p: string) => boolean) => can('employee.manage') || can('employee.edit') },
  { href: '/admin/access', label: 'Access', icon: KeyRound, allowed: (can: (p: string) => boolean) => can('role.view') || can('role.assign_permissions') || can('permission.view') || can('permission.manage') },
  { href: '/admin/forms', label: 'Forms', icon: ClipboardList, allowed: (can: (p: string) => boolean) => can('form.view') || can('form.manage') },
  { href: '/admin/submissions', label: 'Submissions', icon: Inbox, allowed: (can: (p: string) => boolean) => can('submission.view') },
  { href: '/admin/portfolio', label: 'Portfolio', icon: ImageIcon, allowed: (can: (p: string) => boolean) => can('portfolio.manage') },
  { href: '/admin/clients', label: 'Clients', icon: UserRound, allowed: (can: (p: string) => boolean) => can('client.view') },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban, allowed: (can: (p: string) => boolean) => can('project.view') },
  { href: '/admin/operations', label: 'Operations', icon: Settings2, allowed: (can: (p: string) => boolean) => can('admin.manage') || can('project.assign') || can('role.create') },
]

export function AdminSectionNav() {
  const { can } = useAuth()
  const pathname = usePathname()
  const visible = sections.filter((section) => section.allowed(can))
  return <nav aria-label="Administration sections" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
    {visible.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn('inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:text-xs', pathname === href || (href === '/admin/forms' && pathname.startsWith('/admin/forms/')) ? 'border-accent/40 bg-accent/10 text-fg' : 'border-border text-text-secondary hover:bg-surface-raised hover:text-fg')}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></Link>)}
  </nav>
}
