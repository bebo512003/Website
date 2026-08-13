import Link from 'next/link'
import { ArrowLeft, Home } from 'lucide-react'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <PublicSiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <p className="font-mono-tech text-[10px] text-accent">404 / NOT FOUND</p>
        <h1 className="mt-4 max-w-xl font-display text-[clamp(3.5rem,14vw,6rem)] leading-none">This page is not available.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-text-secondary">
          The link may be incorrect, or the content is no longer public.
        </p>
        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground">
            <Home className="h-4 w-4" /> Home
          </Link>
          <Link href="/portfolio" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-fg">
            <ArrowLeft className="h-4 w-4" /> Portfolio
          </Link>
        </div>
      </main>

      <PublicSiteFooter />
    </div>
  )
}
