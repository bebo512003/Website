'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowRight, Layers3, LoaderCircle, Menu, X } from 'lucide-react'
import { getPublicPortfolioProjects } from '@/lib/supabase/database'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { PortfolioProjectCard } from '@/components/portfolio/portfolio-project-card'

export function PortfolioLandingPage() {
  const [projects, setProjects] = useState<PortfolioProjectWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    const result = await getPublicPortfolioProjects()
    setProjects(result.data)
    setError(result.error || '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const categories = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string }>()
    projects.forEach((project) => {
      if (project.portfolio_categories) seen.set(project.portfolio_categories.slug, { slug: project.portfolio_categories.slug, name: project.portfolio_categories.name })
    })
    return [...seen.values()]
  }, [projects])

  const filteredProjects = useMemo(() => activeCategory === 'all'
    ? projects
    : projects.filter((project) => project.portfolio_categories?.slug === activeCategory), [activeCategory, projects])

  const featuredProjects = useMemo(() => {
    const featured = projects.filter((project) => project.featured)
    return featured.length ? featured.slice(0, 3) : projects.slice(0, 3)
  }, [projects])

  const scrollToWork = () => document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <main className="min-h-screen overflow-hidden bg-[#080808] text-white">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
          <Link href="/portfolio" className="group flex items-center gap-3" onClick={() => setMenuOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center border border-white/20 bg-white/[0.05] text-accent transition group-hover:border-accent"><Layers3 className="h-4 w-4" /></span>
            <span><span className="block text-sm font-bold tracking-[0.22em]">AGENCY OS</span><span className="font-mono-tech text-[8px] text-white/40">CREATIVE STUDIO</span></span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Portfolio navigation">
            <a href="#work" className="text-xs text-white/60 transition hover:text-white">Selected work</a>
            <a href="#about" className="text-xs text-white/60 transition hover:text-white">About</a>
            <Link href="/intake" className="inline-flex items-center gap-2 border border-accent bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition hover:brightness-110">Start a project <ArrowRight className="h-3.5 w-3.5" /></Link>
          </nav>
          <button type="button" className="rounded border border-white/15 p-2 text-white md:hidden" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {menuOpen && <nav className="mx-5 grid gap-2 border border-white/10 bg-[#111]/95 p-4 backdrop-blur md:hidden" aria-label="Mobile portfolio navigation"><a href="#work" onClick={() => setMenuOpen(false)} className="px-2 py-2 text-sm text-white/70">Selected work</a><a href="#about" onClick={() => setMenuOpen(false)} className="px-2 py-2 text-sm text-white/70">About</a><Link href="/intake" className="mt-1 inline-flex items-center justify-center gap-2 bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground">Start a project <ArrowRight className="h-4 w-4" /></Link></nav>}
      </header>

      <section className="relative flex min-h-[720px] items-end bg-[radial-gradient(circle_at_80%_15%,rgba(185,40,45,0.24),transparent_35%),linear-gradient(135deg,#080808_0%,#101010_60%,#16090a_100%)] px-5 pb-20 pt-36 sm:min-h-[800px] sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="pointer-events-none absolute right-[12%] top-[25%] hidden h-56 w-56 rounded-full border border-accent/30 sm:block" />
        <div className="pointer-events-none absolute right-[15%] top-[31%] hidden h-40 w-40 rounded-full border border-accent/20 sm:block" />
        <div className="relative mx-auto w-full max-w-7xl">
          <div className="max-w-4xl">
            <p className="mb-6 flex items-center gap-3 font-mono-tech text-[10px] tracking-[0.28em] text-accent"><span className="h-px w-10 bg-accent" />PUBLIC PORTFOLIO / 2026</p>
            <h1 className="max-w-5xl font-display text-[clamp(4.5rem,13vw,11rem)] leading-[0.78] tracking-tight text-white">IDEAS<br /><span className="text-accent">MADE</span><br />VISIBLE.</h1>
            <p className="mt-9 max-w-xl text-base leading-7 text-white/55 sm:text-lg">We build brands, identities, and visual systems that make ambitious companies impossible to overlook.</p>
            <button onClick={scrollToWork} className="mt-9 inline-flex items-center gap-3 border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-accent hover:bg-accent">Explore selected work <ArrowDown className="h-4 w-4" /></button>
          </div>
          <div className="mt-20 flex flex-wrap gap-x-10 gap-y-3 border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.18em] text-white/35"><span>Brand strategy</span><span>Visual identity</span><span>Digital expression</span><span>Creative direction</span></div>
        </div>
      </section>

      <section id="about" className="border-y border-white/10 bg-[#0d0d0d] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <div><p className="font-mono-tech text-[10px] text-accent">01 / WHO WE ARE</p><h2 className="mt-5 max-w-sm font-display text-6xl leading-[0.88] text-white sm:text-7xl">WE TURN<br />INTENT INTO<br /><span className="text-white/35">IMPACT.</span></h2></div>
          <div className="max-w-2xl self-end"><p className="text-xl leading-8 text-white/80 sm:text-2xl sm:leading-9">A focused creative studio for organizations ready to move with clarity. We combine strategy, design, and disciplined execution to create work that lasts beyond the launch.</p><p className="mt-6 max-w-xl text-sm leading-7 text-white/45">From the first conversation to the final detail, we work as an extension of your team — finding the sharpest idea and giving it a visual language people remember.</p></div>
        </div>
      </section>

      <section id="work" className="bg-[#080808] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end"><div><p className="font-mono-tech text-[10px] text-accent">02 / SELECTED WORK</p><h2 className="mt-4 font-display text-6xl leading-none sm:text-8xl">THE WORK.</h2></div><p className="max-w-xs text-sm leading-6 text-white/45">A selection of identities and visual systems built for brands with somewhere to go.</p></div>

          {loading ? <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-white/50"><LoaderCircle className="h-5 w-5 animate-spin text-accent" />Loading selected work…</div> : error ? <div className="border border-red-400/30 bg-red-400/5 px-5 py-4 text-sm text-red-300">{error}</div> : featuredProjects.length > 0 ? <div className="mt-10 grid gap-5 md:grid-cols-2">{featuredProjects.map((project) => <PortfolioProjectCard key={project.id} project={project} featured />)}</div> : <div className="mt-10 border border-white/10 px-6 py-14 text-center text-sm text-white/45">Our selected work is being prepared. Check back soon.</div>}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0d0d0d] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="font-mono-tech text-[10px] text-accent">03 / ALL PROJECTS</p><h2 className="mt-4 font-display text-6xl leading-none sm:text-8xl">MORE WORK.</h2></div><div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter portfolio by category"><button role="tab" aria-selected={activeCategory === 'all'} onClick={() => setActiveCategory('all')} className={`border px-3 py-2 text-xs transition ${activeCategory === 'all' ? 'border-accent bg-accent text-accent-foreground' : 'border-white/15 text-white/50 hover:border-white/40 hover:text-white'}`}>All</button>{categories.map((category) => <button key={category.slug} role="tab" aria-selected={activeCategory === category.slug} onClick={() => setActiveCategory(category.slug)} className={`border px-3 py-2 text-xs transition ${activeCategory === category.slug ? 'border-accent bg-accent text-accent-foreground' : 'border-white/15 text-white/50 hover:border-white/40 hover:text-white'}`}>{category.name}</button>)}</div></div>
          {filteredProjects.length > 0 ? <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredProjects.map((project) => <PortfolioProjectCard key={project.id} project={project} />)}</div> : <div className="mt-10 border border-white/10 px-6 py-14 text-center text-sm text-white/45">No published projects in this category yet.</div>}
        </div>
      </section>

      <section className="relative overflow-hidden bg-accent px-5 py-20 text-accent-foreground sm:px-8 lg:px-10 lg:py-28">
        <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border border-black/15" /><div className="pointer-events-none absolute -right-4 -top-16 h-64 w-64 rounded-full border border-black/10" />
        <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-10 lg:flex-row lg:items-end"><div><p className="font-mono-tech text-[10px] opacity-60">04 / LET&apos;S WORK TOGETHER</p><h2 className="mt-5 max-w-3xl font-display text-7xl leading-[0.82] sm:text-9xl">HAVE A<br />GOOD ONE?</h2></div><div className="max-w-sm"><p className="text-base leading-7 opacity-80">Tell us what you are building. We will bring the right questions, the sharpest thinking, and a clear next step.</p><Link href="/intake" className="mt-7 inline-flex items-center gap-3 border border-black/30 bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/80">Start a conversation <ArrowRight className="h-4 w-4" /></Link></div></div>
      </section>

      <footer className="bg-[#080808] px-5 py-8 sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-white/30 sm:flex-row"><span>AGENCY OS / Creative studio</span><span>Built for brands with intent.</span></div></footer>
    </main>
  )
}
