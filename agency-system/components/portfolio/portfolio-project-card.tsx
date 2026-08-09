import Link from 'next/link'
import { ArrowUpRight, ImageIcon } from 'lucide-react'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'

function projectImage(project: PortfolioProjectWithRelations) {
  if (project.cover_image_path) {
    return project.portfolio_project_images.find((image) => image.storage_path === project.cover_image_path)?.image_url || null
  }
  return project.portfolio_project_images[0]?.image_url || null
}

export function PortfolioProjectCard({ project, featured = false }: { project: PortfolioProjectWithRelations; featured?: boolean }) {
  const image = projectImage(project)

  return (
    <Link
      href={`/portfolio/${project.slug}`}
      className={`group block overflow-hidden border border-white/10 bg-white/[0.035] transition duration-300 hover:-translate-y-1 hover:border-accent/60 hover:bg-white/[0.06] ${featured ? 'md:col-span-2' : ''}`}
    >
      <div className={`relative overflow-hidden bg-surface-raised ${featured ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={project.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-raised via-surface-overlay to-accent/20"><ImageIcon className="h-8 w-8 text-white/30" strokeWidth={1} /></div>
        )}
        <span className="absolute left-4 top-4 border border-white/20 bg-black/60 px-2.5 py-1 font-mono-tech text-[9px] text-white/80 backdrop-blur-sm">
          {project.portfolio_categories?.name || 'Selected work'}
        </span>
        <span className="absolute bottom-4 right-4 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h3 className={`${featured ? 'text-xl sm:text-2xl' : 'text-lg'} font-semibold text-fg transition group-hover:text-accent`}>{project.title}</h3>
          <p className="mt-1 text-sm text-text-tertiary">{project.client_name || 'Independent project'}</p>
        </div>
        {project.featured && <span className="shrink-0 pt-1 font-mono-tech text-[9px] text-accent">FEATURED</span>}
      </div>
    </Link>
  )
}
