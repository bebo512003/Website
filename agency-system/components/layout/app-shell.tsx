'use client'

import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useAccent } from '@/contexts/accent-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { accent } = useAccent()
  
  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg" style={{
      ['--accent' as string]: accent.hsl,
      ['--accent-glow' as string]: accent.glow,
    }}>
      <div className="flex flex-1 flex-col overflow-hidden relative z-10">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <Sidebar />
    </div>
  )
}
