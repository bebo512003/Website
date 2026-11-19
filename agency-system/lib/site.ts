import type { Metadata } from 'next'

export const SITE_NAME = 'Beshoy Ashraf'
export const SITE_TAGLINE = 'Brands, Engineered.'
export const SITE_DEFAULT_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`
export const SITE_DEFAULT_DESCRIPTION =
  'Brand identity design for founders and growing businesses in Egypt and the Gulf. Explore the work or share a project brief.'

/** Cache window for the published forms catalog. */
export const PUBLIC_REVALIDATE_SECONDS = 120

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalized}`
}

export function truncateMeta(value: string | null | undefined, max = 160): string {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  noIndex = false,
}: {
  title: string
  description: string
  path: string
  image?: string | null
  noIndex?: boolean
}): Metadata {
  const url = absoluteUrl(path)
  const imageUrl = image ? absoluteUrl(image) : null
  const ogImage = imageUrl ? [{ url: imageUrl, alt: title }] : undefined
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: ogImage,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}

export const SITE_NAME_AR = 'بيشوي أشرف'
export const SITE_MOTTO_AR = 'خليك تقيل… عشان الخفيف بيطير.'

export const SELECTED_WORK_PATH = '/#work'
export const PROJECT_DESK_PATH = '/forms'

export function projectDeskPath(lang: 'en' | 'ar' = 'en') {
  return `${PROJECT_DESK_PATH}${lang === 'ar' ? '?lang=ar' : ''}#request`
}

export const SITE_NAVIGATION = [
  { key: 'services', href: '/#services', sectionId: 'services', en: 'Services', ar: 'الخدمات' },
  { key: 'portfolio', href: SELECTED_WORK_PATH, sectionId: 'work', en: 'Portfolio', ar: 'الأعمال' },
  { key: 'forms', href: PROJECT_DESK_PATH, sectionId: 'available-forms', en: 'Project desk', ar: 'طلبات المشاريع' },
  { key: 'contact', href: '#contact', sectionId: 'contact', en: 'Contact', ar: 'التواصل' },
] as const
