import Link from 'next/link'
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { coverImageRecord, portfolioImageAlt } from '@/lib/public/portfolio-media'
import { PortfolioImage } from '@/components/public/portfolio-image'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'

export function PortfolioProjectPage({ project }: { project: PortfolioProjectWithRelations }) {
  const cover = coverImageRecord(project)
  const gallery = (project.portfolio_project_images || []).filter((image) => image.image_url)
  const details = cover ? gallery.filter((image) => image.id !== cover.id) : gallery
  const heroAlt = portfolioImageAlt(project, cover?.alt_text, 'cover')

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <PublicSiteHeader
        variant="dark"
        activeKey="portfolio"
      />

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 lg:px-10 lg:pt-12">
        <Link href="/portfolio" className="inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-accent"><ArrowLeft className="h-3.5 w-3.5" /> Back to all work</Link>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-20">
          <div>
            <p className="flex items-center gap-3 font-mono-tech text-[10px] text-accent"><span className="h-px w-8 bg-accent" />{project.portfolio_categories?.name || 'Selected work'}</p>
            <h1 className="mt-5 max-w-4xl break-words font-display text-[clamp(3.5rem,16vw,8rem)] leading-[0.82] tracking-tight">{project.title}</h1>
          </div>
          <div className="lg:pb-2">
            <p className="text-base leading-7 text-white/55">{project.description || 'A considered visual system created with clarity, intention, and attention to every detail.'}</p>
            {project.external_url && (
              <a href={project.external_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-white">
                View external project <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="relative mt-12 border border-white/10 bg-white/[0.035] p-2 sm:mt-16 sm:p-3">
          <div className="relative max-h-[72vh] min-h-72 w-full overflow-hidden">
            <div className="relative aspect-[16/9] max-h-[72vh] w-full">
              <PortfolioImage
                src={cover?.image_url}
                alt={heroAlt}
                priority
                sizes="(min-width: 1280px) 1120px, 100vw"
                className="max-h-[72vh]"
              />
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-10 border-b border-white/10 pb-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <div>
            <p className="font-mono-tech text-[10px] text-accent">PROJECT INFORMATION</p>
            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-6 text-sm min-[420px]:grid-cols-2">
              <div>
                <dt className="text-xs text-white/35">Client / brand</dt>
                <dd className="mt-1 font-medium text-white/80">{project.client_name || 'Confidential'}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/35">Date</dt>
                <dd className="mt-1 font-medium text-white/80">
                  {project.project_date ? new Date(`${project.project_date}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'Not specified'}
                </dd>
              </div>
              <div className="min-[420px]:col-span-2">
                <dt className="text-xs text-white/35">Services</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {project.services.length
                    ? project.services.map((service) => <span key={service} className="border border-white/15 px-2.5 py-1 text-xs text-white/65">{service}</span>)
                    : <span className="text-white/50">Creative direction and design</span>}
                </dd>
              </div>
            </dl>
          </div>
          <div className="max-w-2xl">
            <p className="text-lg leading-8 text-white/72 sm:text-xl">{project.description || 'Every project is an opportunity to make a clear point of view visible.'}</p>
          </div>
        </div>

        {details.length > 0 && (
          <section className="mt-12">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="font-mono-tech text-[10px] text-accent">PROJECT GALLERY</p>
                <h2 className="mt-2 font-display text-5xl">DETAILS.</h2>
              </div>
              <span className="text-xs text-white/35">{gallery.length} images</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {details.map((image) => (
                <div key={image.id} className="relative aspect-[4/3] overflow-hidden border border-white/10 bg-white/[0.035]">
                  <PortfolioImage
                    src={image.image_url}
                    alt={portfolioImageAlt(project, image.alt_text, 'gallery')}
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-20 border-t border-white/10 pt-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono-tech text-[10px] text-accent">NEXT PROJECT</p>
              <p className="mt-2 text-sm text-white/45">Like what you see? Let&apos;s make something with intent.</p>
            </div>
            <Link href="/forms" className="inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">Request a New Project <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </div>

      <PublicSiteFooter variant="dark" />
    </div>
  )
}
