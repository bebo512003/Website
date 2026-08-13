import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'
import { absoluteUrl } from '@/lib/site'

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

export function portfolioImageAbsoluteSrc(storagePath: string): string {
  return absoluteUrl(portfolioImageSrc(storagePath))
}

export function coverImageRecord(project: PortfolioProjectWithRelations) {
  const images = project.portfolio_project_images || []
  if (project.cover_image_path) {
    const cover = images.find((image) => image.storage_path === project.cover_image_path)
    if (cover) return cover
  }
  return images[0] || null
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
