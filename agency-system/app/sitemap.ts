import type { MetadataRoute } from 'next'
import { getCachedPublishedForms, getCachedPublicPortfolioProjects } from '@/lib/supabase/public-server'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 120

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [portfolio, forms] = await Promise.all([
    getCachedPublicPortfolioProjects(),
    getCachedPublishedForms(),
  ])

  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/portfolio'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/forms'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/track'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const portfolioRoutes = portfolio.data.map((project) => ({
    url: absoluteUrl(`/portfolio/${project.slug}`),
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: project.featured ? 0.8 : 0.7,
  }))

  const formRoutes = forms.data.map((form) => ({
    url: absoluteUrl(`/f/${form.slug}`),
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [...staticRoutes, ...portfolioRoutes, ...formRoutes]
}
