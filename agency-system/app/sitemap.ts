import type { MetadataRoute } from 'next'
import { getCachedPublishedForms, getPublicPortfolioProjects } from '@/lib/supabase/public-server'
import { absoluteUrl } from '@/lib/site'
import { portfolioProjectPath } from '@/lib/public/portfolio-media'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [portfolio, forms] = await Promise.all([
    getPublicPortfolioProjects(),
    getCachedPublishedForms(),
  ])

  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/forms'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
  ]

  const portfolioRoutes = portfolio.data.map((project) => ({
    url: absoluteUrl(portfolioProjectPath(project.slug)),
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
