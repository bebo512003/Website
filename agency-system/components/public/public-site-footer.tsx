import Link from 'next/link'
import { Zap } from 'lucide-react'

export function PublicSiteFooter({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  if (variant === 'dark') {
    return (
      <footer className="bg-[#080808] px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-[10px] uppercase tracking-[0.18em] text-white/30 sm:flex-row sm:items-center sm:justify-between">
          <span>AGENCY OS / Creative studio</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Portfolio footer">
            <Link href="/" className="transition hover:text-white">Home</Link>
            <Link href="/forms" className="transition hover:text-white">Request a project</Link>
            <Link href="/auth" className="transition hover:text-white">Login</Link>
          </nav>
          <span>Built for brands with intent.</span>
        </div>
      </footer>
    )
  }

  return (
    <footer className="border-t border-border bg-bg px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center border border-line-light bg-surface-raised text-accent">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-[0.22em] text-fg">AGENCY OS</p>
            <p className="font-mono-tech text-[8px] text-text-tertiary">CREATIVE STUDIO</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-secondary" aria-label="Footer">
          <Link href="/portfolio" className="hover:text-fg">Portfolio</Link>
          <Link href="/forms" className="hover:text-fg">Request a project</Link>
          <Link href="/track" className="hover:text-fg">Track request</Link>
          <Link href="/auth" className="hover:text-fg">Login</Link>
        </nav>
        <p className="font-mono-tech text-[9px] text-text-tertiary">© {new Date().getFullYear()} AGENCY OS</p>
      </div>
    </footer>
  )
}
