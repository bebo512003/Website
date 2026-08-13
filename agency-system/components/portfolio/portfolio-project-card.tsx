import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { coverImageRecord, portfolioImageAlt } from '@/lib/public/portfolio-media'
import { PortfolioImage } from '@/components/public/portfolio-image'

export function PortfolioProjectCard({
  project,
  featured = false,
  priority = false,
}: {
  project: PortfolioProjectWithRelations
  featured?: boolean
  priority?: boolean
}) {
  const cover = coverImageRecord(project)
  const alt = portfolioImageAlt(project, cover?.alt_text, 'cover')

  return (
    <Link
      href={`/portfolio/${project.slug}`}
      className={`group block overflow-hidden border border-white/10 bg-white/[0.035] transition duration-300 hover:-translate-y-1 hover:border-accent/60 hover:bg-white/[0.06] ${featured ? 'md:col-span-2' : ''}`}
    >
      <div className={`relative overflow-hidden bg-surface-raised ${featured ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
        <PortfolioImage
          src={cover?.image_url}
          alt={alt}
          priority={priority}
          sizes={featured ? '(min-width: 768px) 80vw, 100vw' : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'}
          className="transition duration-700 group-hover:scale-105"
        />
        <span className="absolute left-4 top-4 border border-white/20 bg-black/60 px-2.5 py-1 font-mono-tech text-[10px] text-white/80 backdrop-blur-sm">
          {project.portfolio_categories?.name || 'Selected work'}
        </span>
        <span className="absolute bottom-4 right-4 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h3 className={`${featured ? 'text-xl sm:text-2xl' : 'text-lg'} break-words font-semibold text-fg transition group-hover:text-accent`}>{project.title}</h3>
          <p className="mt-1 text-sm text-text-tertiary">{project.client_name || 'Independent project'}</p>
        </div>
        {project.featured && <span className="shrink-0 pt-1 font-mono-tech text-[9px] text-accent">FEATURED</span>}
      </div>
    </Link>
  )
}
