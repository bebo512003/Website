import Link from 'next/link'
import { ArrowDown, ArrowRight } from 'lucide-react'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { PortfolioProjectCard } from '@/components/portfolio/portfolio-project-card'
import { PortfolioCategoryFilter } from '@/components/portfolio/portfolio-category-filter'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'

export function PortfolioLandingPage({
  projects,
  error,
}: {
  projects: PortfolioProjectWithRelations[]
  error: string | null
}) {
  const featured = projects.filter((project) => project.featured)
  const featuredProjects = (featured.length ? featured : projects).slice(0, 3)

  return (
    <div className="min-h-screen overflow-hidden bg-[#080808] text-white">
      <PublicSiteHeader variant="dark" />

      <section className="relative flex min-h-[720px] items-end bg-[radial-gradient(circle_at_80%_15%,rgba(185,40,45,0.24),transparent_35%),linear-gradient(135deg,#080808_0%,#101010_60%,#16090a_100%)] px-5 pb-20 pt-24 sm:min-h-[800px] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="pointer-events-none absolute right-[12%] top-[25%] hidden h-56 w-56 rounded-full border border-accent/30 sm:block" />
        <div className="pointer-events-none absolute right-[15%] top-[31%] hidden h-40 w-40 rounded-full border border-accent/20 sm:block" />
        <div className="relative mx-auto w-full max-w-7xl">
          <div className="max-w-4xl">
            <p className="mb-6 flex items-center gap-3 font-mono-tech text-[10px] tracking-[0.28em] text-accent"><span className="h-px w-10 bg-accent" />PUBLIC PORTFOLIO / 2026</p>
            <h1 className="max-w-5xl font-display text-[clamp(4.5rem,13vw,11rem)] leading-[0.78] tracking-tight text-white">IDEAS<br /><span className="text-accent">MADE</span><br />VISIBLE.</h1>
            <p className="mt-9 max-w-xl text-base leading-7 text-white/55 sm:text-lg">We build brands, identities, and visual systems that make ambitious companies impossible to overlook.</p>
            <a href="#work" className="mt-9 inline-flex items-center gap-3 border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-accent hover:bg-accent">Explore selected work <ArrowDown className="h-4 w-4" /></a>
          </div>
          <div className="mt-20 flex flex-wrap gap-x-10 gap-y-3 border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.18em] text-white/35"><span>Brand strategy</span><span>Visual identity</span><span>Digital expression</span><span>Creative direction</span></div>
        </div>
      </section>

      <section id="about" className="border-y border-white/10 bg-[#0d0d0d] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <div>
            <p className="font-mono-tech text-[10px] text-accent">01 / WHO WE ARE</p>
            <h2 className="mt-5 max-w-sm font-display text-6xl leading-[0.88] text-white sm:text-7xl">WE TURN<br />INTENT INTO<br /><span className="text-white/35">IMPACT.</span></h2>
          </div>
          <div className="max-w-2xl self-end">
            <p className="text-xl leading-8 text-white/80 sm:text-2xl sm:leading-9">A focused creative studio for organizations ready to move with clarity. We combine strategy, design, and disciplined execution to create work that lasts beyond the launch.</p>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/45">From the first conversation to the final detail, we work as an extension of your team — finding the sharpest idea and giving it a visual language people remember.</p>
          </div>
        </div>
      </section>

      <section id="work" className="bg-[#080808] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono-tech text-[10px] text-accent">02 / SELECTED WORK</p>
              <h2 className="mt-4 font-display text-6xl leading-none sm:text-8xl">THE WORK.</h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-white/45">A selection of identities and visual systems built for brands with somewhere to go.</p>
          </div>
          {error ? (
            <div className="mt-10 border border-red-400/30 bg-red-400/5 px-5 py-4 text-sm text-red-300">{error}</div>
          ) : featuredProjects.length > 0 ? (
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {featuredProjects.map((project, index) => (
                <PortfolioProjectCard key={project.id} project={project} featured priority={index === 0} />
              ))}
            </div>
          ) : (
            <div className="mt-10 border border-white/10 px-6 py-14 text-center text-sm text-white/45">Our selected work is being prepared. Check back soon.</div>
          )}
        </div>
      </section>

      <PortfolioCategoryFilter projects={projects} />

      <section className="relative overflow-hidden bg-accent px-5 py-20 text-accent-foreground sm:px-8 lg:px-10 lg:py-28">
        <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border border-black/15" />
        <div className="pointer-events-none absolute -right-4 -top-16 h-64 w-64 rounded-full border border-black/10" />
        <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-10 lg:flex-row lg:items-end">
          <div>
            <p className="font-mono-tech text-[10px] opacity-60">04 / LET&apos;S WORK TOGETHER</p>
            <h2 className="mt-5 max-w-3xl font-display text-7xl leading-[0.82] sm:text-9xl">HAVE A<br />GOOD ONE?</h2>
          </div>
          <div className="max-w-sm">
            <p className="text-base leading-7 opacity-80">Tell us what you are building. We will bring the right questions, the sharpest thinking, and a clear next step.</p>
            <Link href="/forms" className="mt-7 inline-flex min-h-11 items-center gap-3 border border-black/30 bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/80">Request a New Project <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <PublicSiteFooter variant="dark" />
    </div>
  )
}
