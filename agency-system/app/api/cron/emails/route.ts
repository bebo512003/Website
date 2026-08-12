import { flushEmailQueue } from '@/lib/email/flush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const alt = request.headers.get('x-cron-secret') || ''
  return bearer === secret || alt === secret
}

/**
 * Server-side transactional email flush. Vercel Cron (or any scheduler) must
 * call this with `Authorization: Bearer $CRON_SECRET`. It never runs in the
 * browser and never reads provider credentials from the client.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE })
  }

  const result = await flushEmailQueue()
  if (!result.configured) {
    return Response.json(
      { error: 'Transactional email is not configured on the server (RESEND_API_KEY).' },
      { status: 503, headers: NO_STORE },
    )
  }

  return Response.json({ data: result }, { status: 200, headers: NO_STORE })
}

export async function POST(request: Request) {
  return GET(request)
}
