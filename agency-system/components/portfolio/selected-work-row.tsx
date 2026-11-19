'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { PortfolioImage } from '@/components/public/portfolio-image'
import { coverImageRecord, portfolioCoverSrc, portfolioImageAlt, portfolioProjectPath } from '@/lib/public/portfolio-media'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import styles from './selected-work-row.module.css'

export function SelectedWorkRow({ projects }: { projects: PortfolioProjectWithRelations[] }) {
  const row = useRef<HTMLUListElement>(null)
  const [scroll, setScroll] = useState({ previous: false, next: false })

  useEffect(() => {
    const list = row.current
    if (!list) return
    const measure = () => {
      const previous = list.scrollLeft > 2
      const next = list.scrollLeft + list.clientWidth < list.scrollWidth - 2
      setScroll((state) => state.previous === previous && state.next === next ? state : { previous, next })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', measure)
    }
  }, [projects])

  function scrollByCard(direction: -1 | 1) {
    const list = row.current
    const card = list?.firstElementChild
    if (!list || !card) return
    const step = card.getBoundingClientRect().width + (parseFloat(getComputedStyle(list).columnGap) || 0)
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollBy({ left: step * direction, behavior: reducedMotion ? 'instant' : 'smooth' })
  }

  if (!projects.length) {
    return <p className="mt-8 rounded-md border border-border bg-surface px-4 py-6 text-sm text-text-secondary">No projects are on display here right now. You can still explore the work on Behance.</p>
  }

  return (
    <div className="mt-6 w-full min-w-0 md:mt-8">
      {(scroll.previous || scroll.next) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">Scroll to see more projects.</p>
          <div className="flex gap-1">
            <button type="button" aria-label="Previous projects" aria-controls="selected-work-projects" onClick={() => scrollByCard(-1)} disabled={!scroll.previous} className="grid size-9 place-items-center rounded-md border border-border text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-35">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next projects" aria-controls="selected-work-projects" onClick={() => scrollByCard(1)} disabled={!scroll.next} className="grid size-9 place-items-center rounded-md border border-border text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-35">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <ul ref={row} id="selected-work-projects" className={`${styles.row} ${projects.length <= 4 ? styles.smallCollection : ''}`} aria-label="Selected portfolio projects">
        {projects.map((project) => (
          <li key={project.id} className={styles.card}>
            <Link
              href={portfolioProjectPath(project.slug)}
              prefetch={false}
              className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-200 hover:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <PortfolioImage
                src={portfolioCoverSrc(project)}
                alt={portfolioImageAlt(project, coverImageRecord(project)?.alt_text)}
                fallbackLabel={project.title}
                className="aspect-[16/10] rounded-none border-0 border-b"
              />
              <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-3.5">
                {project.portfolio_categories?.name && (
                  <p className="break-words font-mono-tech text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-accent">{project.portfolio_categories.name}</p>
                )}
                <div className="mt-1.5 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words font-display text-sm font-bold leading-tight text-fg sm:text-base">{project.title}</h3>
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                </div>
                {project.subtitle && <p className="mt-1.5 break-words text-xs leading-relaxed text-text-secondary">{project.subtitle}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
