'use client'

import { useMemo, useState } from 'react'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { PortfolioProjectCard } from '@/components/portfolio/portfolio-project-card'

export function PortfolioCategoryFilter({
  projects,
}: {
  projects: PortfolioProjectWithRelations[]
}) {
  const [activeCategory, setActiveCategory] = useState('all')

  const categories = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string }>()
    projects.forEach((project) => {
      if (project.portfolio_categories) {
        seen.set(project.portfolio_categories.slug, {
          slug: project.portfolio_categories.slug,
          name: project.portfolio_categories.name,
        })
      }
    })
    return [...seen.values()]
  }, [projects])

  const filteredProjects = activeCategory === 'all'
    ? projects
    : projects.filter((project) => project.portfolio_categories?.slug === activeCategory)

  return (
    <section className="border-y border-white/10 bg-[#0d0d0d] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono-tech text-[10px] text-accent">03 / ALL PROJECTS</p>
            <h2 className="mt-4 font-display text-6xl leading-none sm:text-8xl">MORE WORK.</h2>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter portfolio by category">
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              className={`border px-3 py-2 text-xs transition ${activeCategory === 'all' ? 'border-accent bg-accent text-accent-foreground' : 'border-white/15 text-white/50 hover:border-white/40 hover:text-white'}`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.slug}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.slug}
                onClick={() => setActiveCategory(category.slug)}
                className={`border px-3 py-2 text-xs transition ${activeCategory === category.slug ? 'border-accent bg-accent text-accent-foreground' : 'border-white/15 text-white/50 hover:border-white/40 hover:text-white'}`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
        {filteredProjects.length > 0 ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <PortfolioProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="mt-10 border border-white/10 px-6 py-14 text-center text-sm text-white/45">
            No published projects in this category yet.
          </div>
        )}
      </div>
    </section>
  )
}
