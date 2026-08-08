'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CheckSquare,
  FileText,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Bot,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  badge?: string
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { t, language } = useLanguage()

  const navItems: NavItem[] = [
    { title: t('nav.dashboard'), href: '/', icon: LayoutDashboard },
    { title: t('nav.projects'), href: '/projects', icon: FolderKanban, badge: '06' },
    { title: t('nav.clients'), href: '/clients', icon: Users },
    { title: t('nav.tasks'), href: '/tasks', icon: CheckSquare },
    { title: t('nav.files'), href: '/files', icon: FileText },
    { title: t('nav.ai'), href: '/ai-assistant', icon: Bot },
    { title: t('nav.reports'), href: '/reports', icon: BarChart3 },
    { title: t('nav.templates'), href: '/templates', icon: Sparkles },
    { title: t('nav.settings'), href: '/settings', icon: Settings },
  ]

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col border-l border-border bg-surface transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Logo Area */}
      <div className="flex h-16 items-center border-b border-border px-4 relative">
        <div className="absolute top-0 right-0 w-20 h-[2px] bg-gradient-to-l from-accent to-transparent" />

        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center border border-line-light bg-surface-raised relative">
            <div className="absolute top-0 right-0 w-2 h-[1px] bg-accent" />
            <div className="absolute bottom-0 left-0 w-2 h-[1px] bg-accent" />
            <Zap className="h-4 w-4 text-accent" strokeWidth={1.5} />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider">AGENCY OS</span>
              <span className="font-mono-tech">نظام الإدارة v1.0</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {!collapsed && (
          <div className="px-3 pt-2 pb-3">
            <span className="font-mono-tech">القائمة الرئيسية</span>
          </div>
        )}

        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative',
                isActive
                  ? 'bg-surface-raised text-fg border border-line-light'
                  : 'text-text-secondary hover:bg-surface-raised hover:text-fg border border-transparent',
                collapsed && 'justify-center px-2'
              )}
            >
              {isActive && (
                <div className="absolute top-0 right-0 bottom-0 w-[2px] bg-accent rounded-r-[4px]" />
              )}

              <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.5} />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.title}</span>
                  {item.badge && (
                    <span className="border border-accent/30 bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-bold tracking-wider">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-border p-3 space-y-2">
        {!collapsed && (
          <div className="px-3 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech">النظام نشط</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-[4px] border border-border p-2 text-text-tertiary hover:border-line-light hover:text-fg transition-colors bg-surface"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  )
}
