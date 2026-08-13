import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PortfolioProjectPage } from '@/components/portfolio/portfolio-project-page'
import { getCachedPublicPortfolioProject, getCachedPublicPortfolioProjects } from '@/lib/supabase/public-server'
import { coverImageRecord } from '@/lib/public/portfolio-media'
import { pageMetadata, truncateMeta } from '@/lib/site'

export const revalidate = 120

export async function generateStaticParams() {
  const { data } = await getCachedPublicPortfolioProjects()
  return data.map((project) => ({ slug: project.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { data } = await getCachedPublicPortfolioProject(slug)
  if (!data) {
    return pageMetadata({
      title: 'Project not found — Agency OS',
      description: 'This portfolio project is not available.',
      path: `/portfolio/${slug}`,
      noIndex: true,
    })
  }
  const cover = coverImageRecord(data)
  return pageMetadata({
    title: `${data.title} — Agency OS Portfolio`,
    description: truncateMeta(data.description) || `Selected work: ${data.title} by Agency OS.`,
    path: `/portfolio/${data.slug}`,
    image: cover?.image_url || null,
  })
}

export default async function PortfolioProjectRoute({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { data } = await getCachedPublicPortfolioProject(slug)
  if (!data) notFound()
  return <PortfolioProjectPage project={data} />
}
