import type { Metadata } from 'next'
import { ClientLandingPage } from './_components/client-landing-page'
import { getCachedPublishedForms, getCachedPublicPortfolioProjects } from '@/lib/supabase/public-server'
import { pageMetadata, SITE_DEFAULT_DESCRIPTION, SITE_DEFAULT_TITLE } from '@/lib/site'

export const revalidate = 120

export const metadata: Metadata = pageMetadata({
  title: SITE_DEFAULT_TITLE,
  description: SITE_DEFAULT_DESCRIPTION,
  path: '/',
})

export default async function HomePage() {
  const [portfolio, forms] = await Promise.all([
    getCachedPublicPortfolioProjects(),
    getCachedPublishedForms(),
  ])

  return (
    <ClientLandingPage
      projects={portfolio.data}
      forms={forms.data}
      error={portfolio.error || forms.error}
    />
  )
}
