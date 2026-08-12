import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/types'

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
 * Server-side deadline scan. Vercel Cron (or any scheduler) must call this
 * with `Authorization: Bearer $CRON_SECRET`. It never runs in the browser.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Reminders are not configured on the server.' }, { status: 503, headers: NO_STORE })
  }

  const service = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await service.rpc('run_deadline_reminders')
  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: NO_STORE })
  }

  return Response.json({ data: data as Json }, { status: 200, headers: NO_STORE })
}

export async function POST(request: Request) {
  return GET(request)
}
