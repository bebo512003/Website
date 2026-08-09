'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Bell, CheckSquare, ChevronLeft, ChevronRight, FileText, FolderKanban, ClipboardList, LayoutDashboard, Settings, ShieldCheck, Users, UsersRound, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { profile, can } = useAuth()

  const navItems = [
    { title: 'Dashboard', href: '/', icon: LayoutDashboard, permission: 'dashboard.view' },
    { title: 'Projects', href: '/projects', icon: FolderKanban, permission: 'project.view' },
    { title: 'Forms', href: '/forms', icon: ClipboardList, permission: 'submission.view' },
    { title: 'Tasks', href: '/tasks', icon: CheckSquare, permission: 'task.view' },
    { title: 'Clients', href: '/clients', icon: Users, permission: 'client.view' },
    { title: 'Team', href: '/team', icon: UsersRound, permission: 'employee.view' },
    { title: 'Files', href: '/files', icon: FileText, permission: 'file.view' },
    { title: 'Notifications', href: '/notifications', icon: Bell, permission: 'notification.view' },
    { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'report.view' },
    { title: 'Administration', href: '/admin', icon: ShieldCheck, permission: 'admin.manage' },
    { title: 'Settings', href: '/settings', icon: Settings, permission: 'settings.view' },
  ].filter((item) => can(item.permission))
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const mobileItems = navItems.filter((item) => ['/', '/projects', '/forms', '/tasks', '/team', '/notifications', '/admin', '/settings'].includes(item.href))

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

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }} aria-label="Mobile navigation">
        {mobileItems.map((item) => { const Icon = item.icon; const active = isActive(item.href); return <Link key={item.href} href={item.href} className={cn('flex flex-col items-center gap-1 py-2 text-[9px]', active ? 'text-accent' : 'text-text-tertiary')}><Icon className="h-4 w-4" /><span className="max-w-full truncate">{item.title === 'Administration' ? 'Admin' : item.title}</span></Link> })}
      </nav>
    </>
  )
}
