'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useAccent } from '@/contexts/accent-context'
import { useAuth } from '@/contexts/auth-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { accent } = useAccent()
  const { user, loading } = useAuth()
  const isAuthPage = pathname === '/auth'

  useEffect(() => {
    if (!loading && !user && !isAuthPage) router.replace('/auth')
  }, [isAuthPage, loading, router, user])

  const style = {
    ['--accent' as string]: accent.hsl,
    ['--accent-glow' as string]: accent.glow,
  }

  if (isAuthPage) return <div style={style}>{children}</div>

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-bg text-sm text-text-secondary" style={style}>
        <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
        Loading your workspace…
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg" style={style}>
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
