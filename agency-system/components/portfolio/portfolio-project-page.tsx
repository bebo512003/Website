import { ArrowUpRight } from 'lucide-react'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { behanceImageUrl, coverImageRecord, portfolioCoverSrc, portfolioExternalUrl, portfolioImageAlt } from '@/lib/public/portfolio-media'
import { PortfolioImage } from '@/components/public/portfolio-image'
import { PublicPage } from '@/components/public/public-page'
import { ProjectInquiry, PublicPageIntro, PublicSectionHeading, publicContentClassName } from '@/components/public/public-page-sections'
import { primaryButtonClassName } from '@/components/ui/page'
import { SELECTED_WORK_PATH } from '@/lib/site'

export function PortfolioProjectPage({ project }: { project: PortfolioProjectWithRelations }) {
  const preview = behanceImageUrl(project.detail_image_url)
  const cover = coverImageRecord(project)
  const hero = preview || portfolioCoverSrc(project)
  const gallery = project.portfolio_project_images.filter((image) => image.image_url && image.image_url !== hero)
  const external = portfolioExternalUrl(project.external_url)
  const isBehance = external && ['www.behance.net', 'behance.net'].includes(new URL(external).hostname)
  const hasInfo = project.client_name || project.project_date || project.services.length > 0

  return (
    <PublicPage activeKey="portfolio">
      <PublicPageIntro
        eyebrow={`Portfolio / ${project.portfolio_categories?.name || 'Selected work'}`}
        title={project.title}
        subtitle={project.subtitle}
        description={project.description}
        backLink={{ href: SELECTED_WORK_PATH, label: 'Back to selected work' }}
        actions={external && (
          <a href={external} target="_blank" rel="noopener noreferrer" className={primaryButtonClassName}>
            {isBehance ? 'View full project on Behance' : 'View external project'} <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </a>
        )}
        compact
      />
      {(hero || hasInfo || gallery.length > 0) && (
        <div className={publicContentClassName}>
          {hero && (
            <section aria-labelledby="project-overview-title">
              <PublicSectionHeading eyebrow="N° 01 / Project preview" title="A closer look." titleId="project-overview-title" />
              <PortfolioImage
                src={hero}
                alt={portfolioImageAlt(project, preview ? null : cover?.alt_text)}
                fallbackLabel={project.title}
                className="mt-6 aspect-[4/3] max-h-[70vh] sm:mt-8 sm:aspect-[16/9]"
              />
            </section>
          )}

          {hasInfo && (
            <section className={hero ? 'mt-8 sm:mt-12' : ''} aria-labelledby="project-info-title">
              <h2 id="project-info-title" className="type-label text-accent">Project information</h2>
              <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-6 text-sm min-[420px]:grid-cols-2">
                {project.client_name && <div><dt className="text-xs text-text-secondary">Client / brand</dt><dd className="mt-1 font-medium text-fg">{project.client_name}</dd></div>}
                {project.project_date && <div><dt className="text-xs text-text-secondary">Date</dt><dd className="mt-1 font-medium text-fg">{new Date(`${project.project_date}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</dd></div>}
                {project.services.length > 0 && (
                  <div className="min-[420px]:col-span-2">
                    <dt className="text-xs text-text-secondary">Services</dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {project.services.map((service, index) => <span key={`${service}-${index}`} className="border border-border px-2.5 py-1 text-xs text-text-secondary">{service}</span>)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {gallery.length > 0 && (
            <section className="mt-12" aria-labelledby="project-gallery-title">
              <PublicSectionHeading eyebrow="N° 02 / Project gallery" title="Project details." titleId="project-gallery-title" className="mb-6" />
              <div className="grid items-start gap-4 sm:grid-cols-2">
                {gallery.map((image) => (
                  <PortfolioImage key={image.id} src={image.image_url} alt={portfolioImageAlt(project, image.alt_text, 'gallery')} fallbackLabel={project.title} natural />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <ProjectInquiry />
    </PublicPage>
  )
}
