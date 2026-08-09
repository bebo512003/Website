'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  FileText,
  ImageIcon,
  Layers3,
  LoaderCircle,
  Lock,
  LogIn,
  Menu,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { getFormTemplates, getPublicPortfolioProjects } from '@/lib/supabase/database'
import type { FormTemplateWithCounts, PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { PortfolioProjectCard } from '@/components/portfolio/portfolio-project-card'

// ── Client Landing Page ──────────────────────────────────────────────────────
// The first page every visitor sees. Three public paths are surfaced clearly:
//   1. Landing → Request a Project (/forms) → Available Forms → Select Form → Submit
//   2. Landing → Portfolio (/portfolio) → Project Details (/portfolio/<slug>)
//   3. Landing → Login (/auth)
// No authentication is required to start any of the first two flows.
// Portfolio data is loaded via the public RPC (published + not archived only).

const SERVICES = [
  {
    id: 'logo_design',
    icon: '◒',
    name: 'Logo Design',
    description: 'Distinctive marks, identity direction, and ready-to-ship usage files.',
  },
  {
    id: 'visual_identity',
    icon: '✦',
    name: 'Visual Identity',
    description: 'A complete visual system: colour, typography, and applied touchpoints.',
  },
  {
    id: 'company_profile',
    icon: '▤',
    name: 'Company Profile',
    description: 'Content, structure, and design of a profile that sells your story.',
  },
] as const

const STEPS = [
  {
    n: '01',
    title: 'Pick a form',
    description: 'Select the form that best describes what you need. No account needed.',
    cta: { label: 'See available forms', href: '/forms' },
  },
  {
    n: '02',
    title: 'Fill it out',
    description: 'Complete the structured questions. Takes only a few minutes.',
    cta: { label: 'Open the forms', href: '/forms' },
  },
  {
    n: '03',
    title: 'We take it from here',
    description: 'Our team reviews your request and reaches out with the next step.',
  },
] as const

export function ClientLandingPage() {
  const [projects, setProjects] = useState<PortfolioProjectWithRelations[]>([])
  const [forms, setForms] = useState<FormTemplateWithCounts[]>([])
  const [loadingPortfolio, setLoadingPortfolio] = useState(true)
  const [loadingForms, setLoadingForms] = useState(true)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    const [portfolioResult, formsResult] = await Promise.all([
      getPublicPortfolioProjects(),
      // Form list is RLS-safe: only published forms surface to anonymous visitors.
      getFormTemplates(),
    ])
    setProjects(portfolioResult.data)
    setForms(formsResult.data.filter((form) => form.status === 'published'))
    setError(portfolioResult.error || formsResult.error || '')
    setLoadingPortfolio(false)
    setLoadingForms(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const categories = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string }>()
    projects.forEach((project) => {
      if (project.portfolio_categories) seen.set(project.portfolio_categories.slug, { slug: project.portfolio_categories.slug, name: project.portfolio_categories.name })
    })
    return [...seen.values()]
  }, [projects])

  const featured = useMemo(() => {
    const featuredOnly = projects.filter((project) => project.featured)
    return (featuredOnly.length ? featuredOnly : projects).slice(0, 3)
  }, [projects])

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
            <a href="#services" className="text-xs text-text-secondary transition hover:text-fg">Services</a>
            <a href="#how" className="text-xs text-text-secondary transition hover:text-fg">How it works</a>
            <Link href="/portfolio" className="text-xs text-text-secondary transition hover:text-fg">Portfolio</Link>
            <Link href="/forms" className="text-xs text-text-secondary transition hover:text-fg">Available forms</Link>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg">
              <LogIn className="h-3.5 w-3.5" /> Sign in
            </Link>
            <Link href="/forms" className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition hover:brightness-110">
              Start a project <ArrowRight className="h-3.5 w-3.5" />
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
              <a href="#services" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">Services</a>
              <a href="#how" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">How it works</a>
              <Link href="/portfolio" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">Portfolio</Link>
              <Link href="/forms" onClick={() => setMenuOpen(false)} className="rounded px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-fg">Available forms</Link>
            </div>
            <div className="mt-3 grid gap-2 border-t border-border pt-3">
              <Link href="/auth" onClick={() => setMenuOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary">
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
              <Link href="/forms" onClick={() => setMenuOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
                Start a project <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-[radial-gradient(circle_at_85%_15%,hsl(var(--accent)/0.18),transparent_40%),linear-gradient(135deg,hsl(var(--color-bg))_0%,hsl(var(--surface))_60%,hsl(var(--surface-raised))_100%)] px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:px-10 lg:pt-32">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="pointer-events-none absolute right-[10%] top-[18%] hidden h-56 w-56 rounded-full border border-accent/25 lg:block" />
        <div className="pointer-events-none absolute right-[14%] top-[26%] hidden h-40 w-40 rounded-full border border-accent/15 lg:block" />
        <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="mb-6 flex items-center gap-3 font-mono-tech text-[10px] tracking-[0.28em] text-accent">
              <span className="h-px w-10 bg-accent" /> AGENCY OS / CLIENT ENTRY
            </p>
            <h1 className="max-w-3xl font-display text-[clamp(3rem,9vw,6.5rem)] leading-[0.85] tracking-tight">
              Build something <span className="text-accent">extraordinary</span>.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-text-secondary sm:text-lg">
              From the first idea to the finished work — we help ambitious brands move with clarity.
              Start a new project, explore our portfolio, or sign in to your workspace.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/forms" className="inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
                <Sparkles className="h-4 w-4" /> Request a New Project
              </Link>
              <Link href="/portfolio" className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-fg transition hover:border-line-light">
                <Layers3 className="h-4 w-4" /> View our portfolio
              </Link>
              <Link href="/auth" className="inline-flex items-center justify-center gap-2 rounded-md border border-transparent px-3 py-3 text-sm font-medium text-text-secondary transition hover:text-fg">
                <Lock className="h-4 w-4" /> Sign in to your account
              </Link>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-3">
              <div>
                <p className="font-display text-2xl leading-none text-fg">3</p>
                <p className="mt-1 font-mono-tech text-[9px] text-text-tertiary">SERVICES</p>
              </div>
              <div>
                <p className="font-display text-2xl leading-none text-fg">{loadingPortfolio ? '—' : projects.length}</p>
                <p className="mt-1 font-mono-tech text-[9px] text-text-tertiary">PUBLISHED PROJECTS</p>
              </div>
              <div>
                <p className="font-display text-2xl leading-none text-fg">{loadingForms ? '—' : forms.length}</p>
                <p className="mt-1 font-mono-tech text-[9px] text-text-tertiary">AVAILABLE FORMS</p>
              </div>
            </div>
          </div>

          {/* Flow card — quick visual of the three public paths */}
          <aside className="rounded-md border border-border bg-surface/85 p-6 backdrop-blur sm:p-7">
            <p className="font-mono-tech text-[10px] text-accent">CLIENT FLOW</p>
            <h2 className="mt-3 font-display text-3xl leading-tight">Three ways to start.</h2>
            <p className="mt-2 text-sm text-text-secondary">No account required for the first two. Sign in only when you need workspace access.</p>
            <ol className="mt-6 grid gap-3">
              {[
                { label: 'Request a New Project', href: '/forms', accent: true },
                { label: 'Browse our portfolio', href: '/portfolio' },
                { label: 'Sign in to your account', href: '/auth' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`group flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm transition ${
                      item.accent
                        ? 'border-accent bg-accent/5 text-accent hover:bg-accent/10'
                        : 'border-border bg-surface-raised text-fg hover:border-line-light'
                    }`}
                  >
                    <span className="font-medium">{item.label}</span>
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────── */}
      <section id="services" className="border-b border-border bg-surface px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono-tech text-[10px] text-accent">01 / WHAT WE BUILD</p>
              <h2 className="mt-3 font-display text-5xl leading-none sm:text-6xl">Services.</h2>
            </div>
            <p className="max-w-md text-sm text-text-secondary">Three focused offerings. Pick one or combine them in a single request.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {SERVICES.map((service) => (
              <article key={service.id} className="group flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-6 transition hover:border-line-light">
                <span className="flex h-12 w-12 items-center justify-center rounded-md border border-line-light bg-bg text-2xl text-accent transition group-hover:border-accent">
                  {service.icon}
                </span>
                <h3 className="text-lg font-semibold text-fg">{service.name}</h3>
                <p className="text-sm leading-6 text-text-secondary">{service.description}</p>
                <Link href="/forms" className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:brightness-110">
                  Request {service.name.toLowerCase()} <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section id="how" className="border-b border-border bg-bg px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono-tech text-[10px] text-accent">02 / HOW IT WORKS</p>
              <h2 className="mt-3 font-display text-5xl leading-none sm:text-6xl">Three steps.</h2>
            </div>
            <p className="max-w-md text-sm text-text-secondary">A clear, public path from your first click to a project we can start working on.</p>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-md border border-border bg-surface p-6">
                <p className="font-mono-tech text-[10px] text-text-tertiary">{step.n}</p>
                <h3 className="mt-3 text-lg font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{step.description}</p>
                {'cta' in step && step.cta && (
                  <Link
                    href={step.cta.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition hover:brightness-110"
                  >
                    {step.cta.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Portfolio ────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-surface px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono-tech text-[10px] text-accent">03 / SELECTED WORK</p>
              <h2 className="mt-3 font-display text-5xl leading-none sm:text-7xl">Our portfolio.</h2>
              <p className="mt-3 max-w-xl text-sm text-text-secondary">
                A live view of every project our team has marked public. Drafts and archived work stay private.
              </p>
            </div>
            <Link href="/portfolio" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
              <Layers3 className="h-4 w-4" /> View our portfolio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {error && (
            <div className="mt-8 rounded-md border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {loadingPortfolio ? (
            <div className="mt-10 flex min-h-72 items-center justify-center gap-3 text-sm text-text-secondary">
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Loading published projects…
            </div>
          ) : featured.length > 0 ? (
            <>
              <div className="mt-10 grid gap-5 md:grid-cols-2">
                {featured.map((project) => (
                  <PortfolioProjectCard key={project.id} project={project} featured />
                ))}
              </div>
              {categories.length > 0 && (
                <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="font-mono-tech text-[10px] text-text-tertiary">CATEGORIES</span>
                  {categories.slice(0, 6).map((category) => (
                    <span key={category.slug} className="rounded border border-border bg-surface-raised px-2.5 py-1">
                      {category.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-secondary">
                  {projects.length} published project{projects.length === 1 ? '' : 's'} available to view in full.
                </p>
                <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-fg transition hover:border-line-light">
                  Browse all projects <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-10 rounded-md border border-border bg-surface-raised px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-bg">
                <ImageIcon className="h-5 w-5 text-text-tertiary" />
              </div>
              <h3 className="text-base font-semibold text-fg">No published projects yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Our portfolio is being curated. In the meantime, you can still request a new project and we will share relevant work privately.
              </p>
              <Link href="/forms" className="mt-5 inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
                <Sparkles className="h-4 w-4" /> Request a New Project <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Available Forms ─────────────────────────────────────────── */}
      <section id="available-forms" className="border-b border-border bg-bg px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono-tech text-[10px] text-accent">04 / AVAILABLE FORMS</p>
              <h2 className="mt-3 font-display text-5xl leading-none sm:text-6xl">Open forms.</h2>
              <p className="mt-3 max-w-xl text-sm text-text-secondary">
                Each form below is a structured way to share what you need. Pick one — no account required.
              </p>
            </div>
            <Link href="/forms" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
              <Sparkles className="h-4 w-4" /> Request a New Project
            </Link>
          </div>

          {loadingForms ? (
            <div className="mt-10 flex min-h-48 items-center justify-center gap-3 text-sm text-text-secondary">
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Loading forms…
            </div>
          ) : forms.length === 0 ? (
            <div className="mt-10 rounded-md border border-border bg-surface px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
                <ClipboardList className="h-5 w-5 text-text-tertiary" />
              </div>
              <h3 className="text-base font-semibold text-fg">No published forms yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Our team hasn&apos;t published any structured forms right now. Check back soon — or browse our portfolio while you wait.
              </p>
              <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-fg transition hover:border-line-light">
                  <Layers3 className="h-4 w-4" /> Browse portfolio
                </Link>
                <Link href="/" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:border-line-light">
                  <ArrowRight className="h-4 w-4" /> Back to home
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {forms.map((form) => (
                <article key={form.id} className="group flex flex-col gap-4 rounded-md border border-border bg-surface p-6 transition hover:border-line-light">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="truncate text-base font-semibold text-fg">{form.title}</h3>
                    <span className="rounded border border-green-500/30 bg-green-500/5 px-1.5 py-0.5 font-mono-tech text-[9px] text-green-400">LIVE</span>
                  </div>
                  {form.description && <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{form.description}</p>}
                  <p className="font-mono-tech text-[10px] text-text-tertiary">
                    {(form.form_questions?.[0]?.count ?? 0)} QUESTIONS · {(form.form_submissions?.[0]?.count ?? 0)} RESPONSES
                  </p>
                  <Link href={`/f/${form.slug}`} className="mt-auto inline-flex items-center gap-2 self-start rounded-md border border-accent bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition hover:brightness-110">
                    <FileText className="h-3.5 w-3.5" /> Open form <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────── */}
      <section className="bg-accent px-5 py-20 text-accent-foreground sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono-tech text-[10px] opacity-60">05 / READY WHEN YOU ARE</p>
            <h2 className="mt-4 max-w-3xl font-display text-6xl leading-[0.85] sm:text-8xl">Let&apos;s begin.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 opacity-80 sm:text-base">
              Pick the path that fits — request a new project, browse the portfolio, or sign in to your account.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/forms" className="inline-flex items-center justify-center gap-2 rounded-md border border-black/30 bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/80">
              <Sparkles className="h-4 w-4" /> Request a New Project <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/portfolio" className="inline-flex items-center justify-center gap-2 rounded-md border border-black/30 bg-transparent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:bg-black/10">
              <Layers3 className="h-4 w-4" /> View portfolio
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
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
            <Link href="/auth" className="hover:text-fg">Sign in</Link>
          </nav>
          <p className="font-mono-tech text-[9px] text-text-tertiary">© {new Date().getFullYear()} AGENCY OS</p>
        </div>
      </footer>
    </main>
  )
}
