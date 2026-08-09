'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Layers3,
  LoaderCircle,
  LogIn,
  Menu,
  Sparkles,
  Zap,
  X,
  ClipboardList,
} from 'lucide-react'
import { getFormTemplates } from '@/lib/supabase/database'
import type { FormTemplateWithCounts } from '@/lib/supabase/types'

// ── Public Forms Listing Page ───────────────────────────────────────────────
// Displays all published forms from the Admin Form Builder.
// Clients click "Request a New Project" → lands here → picks a form → fills it out.
// No authentication required.

const HEADING = 'AGENCY OS / REQUEST A PROJECT'

export default function PublicFormsPage() {
  const [forms, setForms] = useState<FormTemplateWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    const result = await getFormTemplates()
    // Filter to only published forms for public display
    setForms(result.data.filter((form) => form.status === 'published'))
    setError(result.error || '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <main className="min-h-screen overflow-hidden bg-bg text-fg">
      {/* ── Header / Nav ──────────────────────────────────────────────── */}
      <header className="sticky inset-x-0 top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="group flex items-center gap-3" onClick={() => setMenuOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center border border-line-light bg-surface-raised text-accent transition group-hover:border-accent">
              <Zap className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">
              <span className="block text-sm font-bold tracking-[0.22em] text-fg">AGENCY OS</span>
              <span className="font-mono-tech text-[8px] text-text-tertiary">CREATIVE STUDIO</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            <Link href="/portfolio" className="text-xs text-text-secondary transition hover:text-fg">Portfolio</Link>
            <Link href="/forms" className="text-xs text-fg transition">Available forms</Link>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg">
              <LogIn className="h-3.5 w-3.5" /> Sign in
            </Link>
          </div>
          <button
            type="button"
            className="rounded-md border border-border p-2 text-fg md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-border bg-surface px-5 py-4 md:hidden" aria-label="Mobile primary">
            <div className="grid gap-1">
              <Link href="/portfolio" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">Portfolio</Link>
              <Link href="/forms" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-fg hover:bg-surface-raised">Available forms</Link>
            </div>
            <div className="mt-3 grid gap-2 border-t border-border pt-3">
              <Link href="/auth" onClick={() => setMenuOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary">
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* ── Page Content ─────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-text-secondary transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>

        {/* Header */}
        <div className="mt-8">
          <p className="mb-4 flex items-center gap-3 font-mono-tech text-[10px] tracking-[0.28em] text-accent">
            <span className="h-px w-10 bg-accent" /> {HEADING}
          </p>
          <h1 className="font-display text-5xl leading-none tracking-tight text-fg sm:text-6xl">
            Request a New Project
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
            Pick the form that best describes what you need. Fill it out — no account required. 
            We will review your request and reach out with the next step.
          </p>
        </div>

        {/* Forms Grid */}
        <div className="mt-10">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-text-secondary">
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Loading available forms…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-400">
              {error}
            </div>
          ) : forms.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
                <ClipboardList className="h-5 w-5 text-text-tertiary" />
              </div>
              <h3 className="text-base font-semibold text-fg">No forms available yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Our team hasn&apos;t published any structured forms right now. Check back soon or browse our portfolio while you wait.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-fg transition hover:border-line-light">
                  <ArrowLeft className="h-4 w-4" /> Back to home
                </Link>
                <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
                  <Layers3 className="h-4 w-4" /> View portfolio
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-6 text-sm text-text-secondary">
                {forms.length} form{forms.length === 1 ? '' : 's'} available. Select one to get started.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {forms.map((form) => (
                  <article
                    key={form.id}
                    className="group flex flex-col gap-4 rounded-md border border-border bg-surface p-6 transition hover:border-line-light hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate text-lg font-semibold text-fg">{form.title}</h3>
                      <span className="rounded border border-green-500/30 bg-green-500/5 px-1.5 py-0.5 font-mono-tech text-[9px] text-green-400">LIVE</span>
                    </div>
                    {form.description && (
                      <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{form.description}</p>
                    )}
                    <p className="font-mono-tech text-[10px] text-text-tertiary">
                      {form.form_questions?.[0]?.count ?? 0} QUESTIONS · {form.form_submissions?.[0]?.count ?? 0} RESPONSES
                    </p>
                    <Link
                      href={`/f/${form.slug}`}
                      className="mt-auto inline-flex items-center gap-2 self-start rounded-md border border-accent bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
                    >
                      <FileText className="h-4 w-4" /> Open form <ArrowRight className="h-4 w-4" />
                    </Link>
                  </article>
                ))}
              </div>

              {/* Additional info */}
              <div className="mt-10 rounded-md border border-border bg-surface p-6">
                <div className="flex items-start gap-4">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold text-fg">How it works</h3>
                    <ol className="mt-3 space-y-2 text-sm text-text-secondary">
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">1</span>
                        Select the form that matches your needs
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">2</span>
                        Fill out the questions — no account required
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">3</span>
                        Submit and we will review your request
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">4</span>
                        We reach out with next steps
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Browse Portfolio CTA */}
        <div className="mt-10 border-t border-border pt-8">
          <p className="text-sm text-text-secondary">
            Want to see our work first?{' '}
            <Link href="/portfolio" className="font-medium text-accent hover:underline">
              Browse our portfolio →
            </Link>
          </p>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-bg px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            <Link href="/auth" className="hover:text-fg">Sign in</Link>
          </nav>
          <p className="font-mono-tech text-[9px] text-text-tertiary">© {new Date().getFullYear()} AGENCY OS</p>
        </div>
      </footer>
    </main>
  )
}
