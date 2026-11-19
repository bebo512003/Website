import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { absoluteUrl } from '@/lib/site'

const BEHANCE_IMAGE_URL = /^https:\/\/mir-s3-cdn-cf\.behance\.net\/(?:projects|project_modules)\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|avif)$/

/** Match the database constraint: original Behance CDN files only. */
export function behanceImageUrl(value: string | null | undefined): string | null {
  const url = value?.trim()
  return url && url.length <= 1024 && !url.includes('..') && BEHANCE_IMAGE_URL.test(url) ? url : null
}

export function portfolioExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function portfolioProjectPath(slug: string) {
  return `/portfolio/${encodeURIComponent(slug)}`
}

/** Rejects traversal and unexpected characters before we talk to Storage. */
export function isSafePortfolioStoragePath(path: string): boolean {
  if (!path || path.length > 512) return false
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) return false
  if (path.startsWith('/') || path.endsWith('/')) return false
  return /^[A-Za-z0-9._/-]+$/.test(path)
}

/** Stable, cacheable public URL for a published portfolio image. */
export function portfolioImageSrc(storagePath: string): string {
  const segments = storagePath.split('/').filter(Boolean).map(encodeURIComponent)
  return `/api/public/portfolio-image/${segments.join('/')}`
}

export function coverImageRecord(project: PortfolioProjectWithRelations) {
  const images = project.portfolio_project_images || []
  if (project.cover_image_path) {
    const cover = images.find((image) => image.storage_path === project.cover_image_path)
    if (cover?.image_url) return cover
  }
  if (behanceImageUrl(project.cover_image_url)) return null
  return images.find((image) => image.image_url) || null
}

export function portfolioCoverSrc(project: PortfolioProjectWithRelations) {
  return coverImageRecord(project)?.image_url || behanceImageUrl(project.cover_image_url) || behanceImageUrl(project.detail_image_url)
}

export function publicPortfolioOgImage(src: string | null) {
  return src?.startsWith('/api/public/portfolio-image/') ? absoluteUrl(src) : behanceImageUrl(src)
}

export function portfolioImageAlt(
  project: Pick<PortfolioProjectWithRelations, 'title' | 'client_name' | 'portfolio_categories'>,
  imageAlt?: string | null,
  kind: 'cover' | 'gallery' = 'cover',
): string {
  const explicit = (imageAlt || '').trim()
  if (explicit) return explicit
  const category = project.portfolio_categories?.name
  const client = project.client_name
  const parts = [project.title]
  if (kind === 'cover') {
    if (category) parts.push(category)
    if (client) parts.push(`for ${client}`)
  }
  return parts.join(' — ')
}
