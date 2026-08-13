'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Bell, CheckSquare, ChevronLeft, ChevronRight, FileText, FolderKanban, Inbox, ClipboardList, LayoutDashboard, ListTodo, Settings, ShieldCheck, Users, UsersRound, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { ADMIN_AREA_PERMISSIONS } from '@/lib/permissions'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { profile, can, hasAny } = useAuth()

  const navItems = [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, show: can('dashboard.view') },
    { title: 'My Work', href: '/my-work', icon: ListTodo, show: can('task.view') },
    { title: 'Projects', href: '/projects', icon: FolderKanban, show: can('project.view') },
    { title: 'Forms', href: '/admin/forms', icon: ClipboardList, show: can('form.manage') || can('form.view') },
    { title: 'Submissions', href: '/submissions', icon: Inbox, show: can('submission.view') },
    { title: 'Tasks', href: '/tasks', icon: CheckSquare, show: can('task.view') },
    { title: 'Clients', href: '/clients', icon: Users, show: can('client.view') },
    { title: 'Team', href: '/team', icon: UsersRound, show: can('employee.view') },
    { title: 'Files', href: '/files', icon: FileText, show: can('file.view') },
    { title: 'Notifications', href: '/notifications', icon: Bell, show: can('notification.view') },
    { title: 'Reports', href: '/reports', icon: BarChart3, show: can('report.view') },
    { title: 'Administration', href: '/admin', icon: ShieldCheck, show: hasAny(...ADMIN_AREA_PERMISSIONS) },
    { title: 'Settings', href: '/settings', icon: Settings, show: can('settings.view') },
  ].filter((item) => item.show)
  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/admin') return pathname === '/admin' || (pathname.startsWith('/admin/') && !['/admin/forms', '/admin/portfolio', '/admin/roles', '/admin/team'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)))
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  // A fixed bottom bar has room for five reliable touch targets, not every
  // desktop destination. Profile and search remain in the top bar; the most
  // useful work areas are kept here without squeezing labels into unreadability.
  const mobileItems = navItems.filter((item) => ['/dashboard', '/projects', '/tasks', '/notifications', '/admin'].includes(item.href)).slice(0, 5)

  return (
    <>
      <aside className={cn('hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-all duration-300 md:flex', collapsed ? 'w-16' : 'w-64')}>
        <div className="relative flex h-16 items-center border-b border-border px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-line-light bg-surface-raised"><Zap className="h-4 w-4 text-accent" /></div>
            {!collapsed && <div className="whitespace-nowrap"><div className="text-sm font-bold tracking-wider">AGENCY OS</div><div className="font-mono-tech text-[8px] text-text-tertiary">OPERATIONS PLATFORM</div></div>}
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {!collapsed && <p className="px-3 pb-2 pt-1 font-mono-tech text-[9px] text-text-tertiary">WORKSPACE</p>}
          {navItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return <Link key={item.href} href={item.href} title={collapsed ? item.title : undefined} className={cn('relative flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors', active ? 'border-line-light bg-surface-raised text-fg' : 'border-transparent text-text-secondary hover:bg-surface-raised hover:text-fg', collapsed && 'justify-center px-2')}>{active && <span className="absolute bottom-2 left-0 top-2 w-0.5 bg-accent" />}<Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />{!collapsed && <span>{item.title}</span>}</Link>
          })}
        </nav>
        <div className="border-t border-border p-3">
          {!collapsed && <div className="mb-3 px-3"><div className="truncate text-xs font-medium text-fg">{profile?.full_name || profile?.email || 'Signed in'}</div><div className="mt-1 font-mono-tech text-[8px] text-text-tertiary">{profile?.role || 'EMPLOYEE'}</div></div>}
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex w-full items-center justify-center rounded-md border border-border bg-surface p-2 text-text-tertiary transition hover:text-fg" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid min-h-16 border-t border-border bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${Math.max(mobileItems.length, 1)}, minmax(0, 1fr))` }} aria-label="Mobile navigation">
        {mobileItems.map((item) => { const Icon = item.icon; const active = isActive(item.href); return <Link key={item.href} href={item.href} className={cn('flex min-h-15 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium', active ? 'text-accent' : 'text-text-tertiary')}><Icon className="h-[18px] w-[18px] shrink-0" /><span className="max-w-full truncate">{item.title === 'Administration' ? 'Admin' : item.title}</span></Link> })}
      </nav>
    </>
  )
}
