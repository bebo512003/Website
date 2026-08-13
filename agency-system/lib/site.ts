import type { Metadata } from 'next'

export const SITE_NAME = 'Agency OS'
export const SITE_TAGLINE = 'Creative studio'
export const SITE_DEFAULT_TITLE = 'Agency OS — Build something extraordinary'
export const SITE_DEFAULT_DESCRIPTION =
  'Start a new project, browse our portfolio of published work, and access the forms you need — all without an account.'

/** ISR window for public catalog pages (landing, forms, portfolio). */
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
