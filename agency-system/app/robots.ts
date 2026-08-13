import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/forms', '/f/', '/portfolio', '/track', '/auth'],
        disallow: [
          '/admin',
          '/api/',
          '/dashboard',
          '/portal',
          '/projects',
          '/clients',
          '/tasks',
          '/files',
          '/team',
          '/submissions',
          '/notifications',
          '/reports',
          '/settings',
          '/profile',
          '/my-work',
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  }
}
