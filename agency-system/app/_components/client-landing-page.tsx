import Image from 'next/image'
import Link from 'next/link'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Box, Layers3, PanelsTopLeft } from 'lucide-react'
import type { PortfolioProjectWithRelations, PublicFormTemplateSummary } from '@/lib/supabase/types'
import { SelectedWorkRow } from '@/components/portfolio/selected-work-row'
import { BehanceLink } from '@/components/public/behance-link'
import { PublishedFormCard } from '@/components/public/published-form-card'
import { PublicPage } from '@/components/public/public-page'
import { ProjectInquiry, PublicEyebrow, PublicSectionHeading } from '@/components/public/public-page-sections'
import { primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { SITE_CONTACT } from '@/lib/contact'
import { SELECTED_WORK_PATH } from '@/lib/site'
import beshoyPortrait from '../_assets/beshoy-ashraf-portrait.webp'
import styles from './client-landing-page.module.css'

const SERVICES = [
  { number: '01', icon: Box, name: 'Logo design', description: 'A distinctive mark with a clear rationale and rules that keep it recognisable across sizes and applications.' },
  { number: '02', icon: Layers3, name: 'Visual identity', description: 'A connected system of colour, type, and graphic elements, built to hold together as your brand grows.' },
  { number: '03', icon: PanelsTopLeft, name: 'Company profiles', description: 'Editorial structure and design for company profiles that make your offer easy to understand.' },
] as const

const STEPS = [
  { number: '01', title: 'Choose a form', description: 'Pick the project form that fits your needs. No account required.' },
  { number: '02', title: 'Share your brief', description: 'Describe what you’re building, who it’s for, and what needs to change.' },
  { number: '03', title: 'Follow your request', description: 'Keep the reference number after submitting. Use it to check the status while I review your brief.' },
] as const

export function ClientLandingPage({ forms, projects }: { forms: PublicFormTemplateSummary[]; projects: PortfolioProjectWithRelations[] }) {
  return (
    <PublicPage>
      <section aria-labelledby="hero-title" className="border-b border-border bg-bg">
        <div className={`site-container gap-8 py-12 sm:gap-12 sm:py-16 lg:py-20 xl:gap-16 ${styles.heroLayout}`}>
          {/* The local portrait is lossless; serve it without a second encode. */}
          <Image
            src={beshoyPortrait}
            alt="Portrait of Beshoy Ashraf"
            unoptimized
            loading="eager"
            fetchPriority="high"
            className={styles.portrait}
          />
          <div className="min-w-0">
            <PublicEyebrow>Independent brand design</PublicEyebrow>
            <h1 id="hero-title" className="type-display mt-6 text-fg max-[360px]:text-[2.75rem]">
              Brands,<br /><strong className="font-extrabold">Engineered.</strong>
            </h1>
            <p className="type-lede mt-6 max-w-lg text-text-secondary">
              I help founders in Egypt and the Gulf turn scattered ideas into clear brand systems, built with an engineer’s logic and a designer’s craft.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/forms" className={`${primaryButtonClassName} min-h-12`}>
                Request a project <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <a href={SELECTED_WORK_PATH} className={`${secondaryButtonClassName} min-h-12`}>
                See the work <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <div className="site-container">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
            <p className="type-label text-text-secondary">Strategy / Identity / Application</p>
            <a href="#services" className="type-label inline-flex items-center gap-2 text-fg hover:underline">
              Explore services <ArrowDownRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-18 border-b border-border py-16 md:py-24">
        <div className="site-container">
          <PublicSectionHeading
            eyebrow="N° 01 / Services"
            title="Design with a reason."
            className="flex-col items-start sm:flex-row sm:items-end"
            action={<p className="max-w-sm text-text-secondary">From the first mark to the finished profile, every decision has a purpose.</p>}
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SERVICES.map(({ number, name, icon: Icon, description }) => (
              <article key={number} className="flex min-w-0 flex-col border border-border bg-surface p-6 sm:p-8">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <Icon className="size-7 text-fg" strokeWidth={1.25} aria-hidden="true" />
                  <span className="type-label text-text-secondary">/ {number}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{name}</h3>
                <p className="mt-2 text-sm text-text-secondary">{description}</p>
                <Link href="/forms" aria-label={`Request ${name.toLowerCase()}`} className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-sm text-fg hover:underline hover:underline-offset-4">
                  Request service <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="work" aria-labelledby="selected-work-title" className="scroll-mt-18 border-b border-border py-16 md:py-24">
        <div className="site-container">
          <PublicSectionHeading
            eyebrow="N° 02 / Portfolio"
            title="Selected work."
            titleId="selected-work-title"
            action={<BehanceLink label="More work on Behance" />}
          />
          <SelectedWorkRow projects={projects} />
        </div>
      </section>

      <section id="available-forms" className="scroll-mt-18 border-b border-border py-16 md:py-24">
        <div className="site-container">
          <PublicSectionHeading
            eyebrow="N° 03 / Project requests"
            title="Start with a brief."
            action={<Link href="/forms" className={secondaryButtonClassName}>All project forms <ArrowRight className="size-4" aria-hidden="true" /></Link>}
          />
          <ol id="how" className="mt-8 grid scroll-mt-18 gap-4 sm:grid-cols-3">
            {STEPS.map(({ number, title, description }) => (
              <li key={number} className="border-t border-border pt-4 text-sm">
                <p className="type-label text-text-secondary">/ {number}</p>
                <h3 className="mt-2 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-text-secondary">{description}</p>
              </li>
            ))}
          </ol>
          {forms.length ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {forms.map((form) => <PublishedFormCard key={form.id} form={form} compact openInDesk />)}
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-border bg-surface p-6 sm:p-8">
              <p className="text-text-secondary">No project forms are available right now. Tell me about your project directly.</p>
              <a href={SITE_CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" className={secondaryButtonClassName}>
                Message on WhatsApp <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </section>

      <ProjectInquiry action={<a href={SITE_CONTACT.mailto} className={primaryButtonClassName}>Email me <ArrowUpRight className="size-4" aria-hidden="true" /></a>} />
    </PublicPage>
  )
}
