import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  ImageIcon,
  Layers3,
  Lock,
  Sparkles,
} from 'lucide-react'
import type { PortfolioProjectWithRelations, PublicFormTemplateSummary } from '@/lib/supabase/types'
import { PortfolioProjectCard } from '@/components/portfolio/portfolio-project-card'
import { PublishedFormCard } from '@/components/public/published-form-card'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'

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

export function ClientLandingPage({
  projects,
  forms,
  error,
}: {
  projects: PortfolioProjectWithRelations[]
  forms: PublicFormTemplateSummary[]
  error: string | null
}) {
  const categories = new Map<string, { slug: string; name: string }>()
  projects.forEach((project) => {
    if (project.portfolio_categories) {
      categories.set(project.portfolio_categories.slug, {
        slug: project.portfolio_categories.slug,
        name: project.portfolio_categories.name,
      })
    }
  })
  const categoryList = [...categories.values()]
  const featuredOnly = projects.filter((project) => project.featured)
  const featured = (featuredOnly.length ? featuredOnly : projects).slice(0, 3)

  return (
    <div className="min-h-screen overflow-hidden bg-bg text-fg">
      <PublicSiteHeader />

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
              Start a new project or explore our portfolio without an account. Team members can use the secure login.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/forms" className="inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
                <Sparkles className="h-4 w-4" /> Request a New Project
              </Link>
              <Link href="/portfolio" className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-fg transition hover:border-line-light">
                <Layers3 className="h-4 w-4" /> View our portfolio
              </Link>
              <Link href="/auth" className="inline-flex items-center justify-center gap-2 rounded-md border border-transparent px-3 py-3 text-sm font-medium text-text-secondary transition hover:text-fg">
                <Lock className="h-4 w-4" /> Team login
              </Link>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-3">
              <div>
                <p className="font-display text-2xl leading-none text-fg">3</p>
                <p className="mt-1 font-mono-tech text-[9px] text-text-tertiary">SERVICES</p>
              </div>
              <div>
                <p className="font-display text-2xl leading-none text-fg">{projects.length}</p>
                <p className="mt-1 font-mono-tech text-[9px] text-text-tertiary">PUBLISHED PROJECTS</p>
              </div>
              <div>
                <p className="font-display text-2xl leading-none text-fg">{forms.length}</p>
                <p className="mt-1 font-mono-tech text-[9px] text-text-tertiary">AVAILABLE FORMS</p>
              </div>
            </div>
          </div>

          <aside className="rounded-md border border-border bg-surface/85 p-6 backdrop-blur sm:p-7">
            <p className="font-mono-tech text-[10px] text-accent">CLIENT FLOW</p>
            <h2 className="mt-3 font-display text-3xl leading-tight">Choose your next step.</h2>
            <p className="mt-2 text-sm text-text-secondary">Clients can request work or browse the portfolio without an account. Login is for existing team accounts only.</p>
            <ol className="mt-6 grid gap-3">
              {[
                { label: 'Request a New Project', href: '/forms', accent: true },
                { label: 'Browse our portfolio', href: '/portfolio' },
                { label: 'Team login', href: '/auth' },
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
                  <Link href={step.cta.href} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition hover:brightness-110">
                    {step.cta.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

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

          {featured.length > 0 ? (
            <>
              <div className="mt-10 grid gap-5 md:grid-cols-2">
                {featured.map((project, index) => (
                  <PortfolioProjectCard key={project.id} project={project} featured priority={index === 0} />
                ))}
              </div>
              {categoryList.length > 0 && (
                <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="font-mono-tech text-[10px] text-text-tertiary">CATEGORIES</span>
                  {categoryList.slice(0, 6).map((category) => (
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

          {forms.length === 0 ? (
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
                <PublishedFormCard key={form.id} form={form} compact />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-accent px-5 py-20 text-accent-foreground sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono-tech text-[10px] opacity-60">05 / READY WHEN YOU ARE</p>
            <h2 className="mt-4 max-w-3xl font-display text-6xl leading-[0.85] sm:text-8xl">Let&apos;s begin.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 opacity-80 sm:text-base">
              Request a new project or browse the portfolio publicly. Existing team members can log in from the navigation.
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

      <PublicSiteFooter />
    </div>
  )
}
