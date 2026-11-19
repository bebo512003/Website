import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PortfolioProjectPage } from '@/components/portfolio/portfolio-project-page'
import { getPublicPortfolioProject } from '@/lib/supabase/public-server'
import { portfolioCoverSrc, portfolioProjectPath, publicPortfolioOgImage } from '@/lib/public/portfolio-media'
import { absoluteUrl } from '@/lib/site'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { data } = await getPublicPortfolioProject(slug)
  if (!data) return { title: 'Project not found' }
  const canonical = absoluteUrl(portfolioProjectPath(data.slug))
  const description = data.description || data.subtitle || `${data.title} — selected work by Beshoy Ashraf.`
  const image = publicPortfolioOgImage(portfolioCoverSrc(data))
  return {
    title: data.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title: data.title,
      description,
      url: canonical,
      images: image ? [{ url: image, alt: data.title }] : undefined,
    },
  }
}

export default async function PublicPortfolioSlugPage({ params }: Props) {
  const { slug } = await params
  const { data } = await getPublicPortfolioProject(slug)
  if (!data) notFound()
  return <PortfolioProjectPage project={data} />
}
