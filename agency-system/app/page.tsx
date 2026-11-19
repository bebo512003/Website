import type { Metadata } from 'next'
import { ClientLandingPage } from './_components/client-landing-page'
import { getCachedPublishedForms, getPublicSelectedPortfolio } from '@/lib/supabase/public-server'
import { pageMetadata, SITE_DEFAULT_DESCRIPTION, SITE_DEFAULT_TITLE } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: SITE_DEFAULT_TITLE,
  description: SITE_DEFAULT_DESCRIPTION,
  path: '/',
})

export default async function HomePage() {
  const [{ data: forms }, { data: projects }] = await Promise.all([
    getCachedPublishedForms(),
    getPublicSelectedPortfolio(),
  ])
  return <ClientLandingPage forms={forms} projects={projects} />
}
