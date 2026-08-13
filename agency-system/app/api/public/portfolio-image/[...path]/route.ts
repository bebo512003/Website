import { NextResponse } from 'next/server'
import { createPublicSupabaseClient } from '@/lib/supabase/public-server'
import { isSafePortfolioStoragePath } from '@/lib/public/portfolio-media'

function notFound() {
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}

/**
 * Serves a published portfolio image only.
 *
 * Unpublished / archived / unknown paths 404 — the same response as a missing
 * file — so guessing a storage path never confirms a private asset exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path || []
  const storagePath = segments.map((segment) => decodeURIComponent(segment)).join('/')
  if (!isSafePortfolioStoragePath(storagePath)) return notFound()

  const supabase = createPublicSupabaseClient()
  if (!supabase) return notFound()

  const { data: isPublic, error: checkError } = await supabase.rpc('is_public_portfolio_image', {
    object_name: storagePath,
  })
  if (checkError || !isPublic) return notFound()

  const { data, error } = await supabase.storage.from('portfolio-images').createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) return notFound()

  const upstream = await fetch(data.signedUrl)
  if (!upstream.ok || !upstream.body) return notFound()

  const contentType = upstream.headers.get('content-type') || 'image/jpeg'
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
