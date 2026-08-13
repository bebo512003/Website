import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

// ── GET & POST /api/forms/track ─────────────────────────────────────────────
// Public tracking gateway. Securely looks up the submission tracking status
// using the unguessable reference number or safe tracking token.
// Exposes ONLY the sanitized, non-sensitive projection returned by the
// `get_public_submission_tracking` RPC.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ref = searchParams.get('ref') || searchParams.get('token') || searchParams.get('key') || ''
  return handleTracking(ref)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { key?: string; ref?: string; token?: string }
    const key = body.key || body.ref || body.token || ''
    return handleTracking(key)
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}

async function handleTracking(rawKey: string) {
  const trackingKey = (rawKey || '').trim()
  if (!trackingKey) {
    return NextResponse.json({ error: 'Please enter a valid request reference number or tracking token.' }, { status: 400 })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase.rpc('get_public_submission_tracking', {
      p_tracking_key: trackingKey,
    })

    if (error) {
      return NextResponse.json({ error: 'Unable to load tracking details. Please try again.' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'No request found matching this reference number. Please verify the code and try again.' }, { status: 404 })
    }

    return NextResponse.json({ data, error: null })
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred while fetching tracking details.' }, { status: 500 })
  }
}
