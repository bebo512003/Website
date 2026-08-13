import type { Metadata } from 'next'
import { PortfolioLandingPage } from '@/components/portfolio/portfolio-landing-page'
import { getCachedPublicPortfolioProjects } from '@/lib/supabase/public-server'
import { pageMetadata } from '@/lib/site'

export const revalidate = 120

export const metadata: Metadata = pageMetadata({
  title: 'Portfolio — Agency OS',
  description: 'Selected branding, visual identity, and design work by Agency OS. Only published projects are shown.',
  path: '/portfolio',
})

export default async function PortfolioPage() {
  const { data, error } = await getCachedPublicPortfolioProjects()
  return <PortfolioLandingPage projects={data} error={error} />
}
