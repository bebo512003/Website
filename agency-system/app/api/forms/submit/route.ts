import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { flushEmailQueue } from '@/lib/email/flush'
import {
  mapPublicFormSubmitError,
  persistPublicFormSubmission,
  PublicFormSubmitError,
} from '@/lib/forms/persist-submission'
import type { Database } from '@/lib/supabase/database.types'

// ── POST /api/forms/submit ───────────────────────────────────────────────────
// Server-side gateway for public form submissions. Performs:
//   1. IP-based rate limiting (in-memory, per-IP sliding window)
//   2. Cloudflare Turnstile token verification (when configured)
//   3. Payload size pre-check
//   4. Persists the submission with the service role (does not call the
//      submit_dynamic_form RPC, which crashes on hosted Supabase when
//      digest()/gen_random_bytes() are not on search_path = public).
//
// Env vars (server-only):
//   TURNSTILE_SECRET_KEY   — Cloudflare Turnstile secret
//   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — required to save public submissions

const TURNSTILE_SECRET = (process.env.TURNSTILE_SECRET_KEY || '').trim()
const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim()
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string }
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

// ── In-memory IP rate limiter ────────────────────────────────────────────────
// Sliding window: max 10 submissions per IP per minute, 30 per hour.
// Entries are pruned lazily. This is intentionally simple — for high-traffic
// production, swap this for Redis or a dedicated rate-limit service.
type Timestamps = number[]

const ipMinuteBuckets = new Map<string, Timestamps>()
const ipHourBuckets = new Map<string, Timestamps>()

const MAX_PER_MINUTE = 10
const MAX_PER_HOUR = 30
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const MAX_BODY_BYTES = 200_000 // ~200 KB hard limit on the request body

function checkIpRate(ip: string): { blocked: boolean; retryAfter?: number } {
  const now = Date.now()

  // Minute window
  let minuteTimestamps = ipMinuteBuckets.get(ip)
  if (!minuteTimestamps) {
    minuteTimestamps = []
    ipMinuteBuckets.set(ip, minuteTimestamps)
  }
  // Prune old entries
  while (minuteTimestamps.length > 0 && now - minuteTimestamps[0] > MINUTE_MS) {
    minuteTimestamps.shift()
  }
  if (minuteTimestamps.length >= MAX_PER_MINUTE) {
    const retryAfter = Math.ceil((minuteTimestamps[0] + MINUTE_MS - now) / 1000)
    return { blocked: true, retryAfter }
  }

  // Hour window
  let hourTimestamps = ipHourBuckets.get(ip)
  if (!hourTimestamps) {
    hourTimestamps = []
    ipHourBuckets.set(ip, hourTimestamps)
  }
  while (hourTimestamps.length > 0 && now - hourTimestamps[0] > HOUR_MS) {
    hourTimestamps.shift()
  }
  if (hourTimestamps.length >= MAX_PER_HOUR) {
    const retryAfter = Math.ceil((hourTimestamps[0] + HOUR_MS - now) / 1000)
    return { blocked: true, retryAfter }
  }

  // Record this request
  minuteTimestamps.push(now)
  hourTimestamps.push(now)
  return { blocked: false }
}

// Periodically clean up stale IPs (every 10 minutes).
setInterval(() => {
  const now = Date.now()
  for (const [ip, timestamps] of ipMinuteBuckets) {
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > MINUTE_MS * 2) {
      ipMinuteBuckets.delete(ip)
    }
  }
  for (const [ip, timestamps] of ipHourBuckets) {
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > HOUR_MS * 2) {
      ipHourBuckets.delete(ip)
    }
  }
}, 600_000).unref()

// ── Turnstile verification ───────────────────────────────────────────────────
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true // not configured — skip
  if (!token) return false

  try {
    const form = new URLSearchParams()
    form.append('secret', TURNSTILE_SECRET)
    form.append('response', token)
    form.append('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const json = (await res.json()) as { success: boolean }
    return json.success === true
  } catch {
    return false
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Extract client IP
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    // 2. IP rate limit
    const rateCheck = checkIpRate(ip)
    if (rateCheck.blocked) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } },
      )
    }

    // 3. Body size guard
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Your submission is too large.' },
        { status: 413 },
      )
    }

    // 4. Parse body
    let body: { formId?: string; answers?: unknown; turnstileToken?: string; accessToken?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { formId, answers, turnstileToken, accessToken } = body

    if (!formId || typeof formId !== 'string') {
      return NextResponse.json({ error: 'Missing form ID.' }, { status: 400 })
    }
    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers.' }, { status: 400 })
    }
    // Access token is optional: when anonymous sign-in works it carries the
    // caller's identity; when it does not (older GoTrue), the server falls
    // back to the public anon key. Text-only submissions still work; file
    // uploads are disabled on the client in that case.
    const callerToken = (typeof accessToken === 'string' && accessToken) || ''

    // 5. Turnstile verification — only when BOTH keys are configured.
    // A secret without a site key would reject every real submission.
    if (TURNSTILE_SECRET && TURNSTILE_SITE_KEY) {
      const turnstileOk = await verifyTurnstile(String(turnstileToken || ''), ip)
      if (!turnstileOk) {
        return NextResponse.json(
          { error: 'Bot verification failed. Please refresh and try again.' },
          { status: 403 },
        )
      }
    }

    // 6. Payload size pre-check
    const answersJson = JSON.stringify(answers)
    if (answersJson.length > 102400) {
      return NextResponse.json(
        { error: 'Your submission is too large. Please shorten your answers.' },
        { status: 413 },
      )
    }

    // 7. Persist the submission.
    //
    //    Prefer a service-role insert that never calls submit_dynamic_form.
    //    That RPC is SECURITY DEFINER with search_path = public, so on hosted
    //    Supabase digest() / gen_random_bytes() (extensions schema) throw and
    //    the UI only sees "Something went wrong." Writing the rows here also
    //    survives a live database that has not applied the latest migration
    //    (NULL session_id on form_rate_limits, JWT-as-Authorization crashes).
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
    }

    const writeKey = SERVICE_ROLE_KEY || ANON_KEY
    if (!writeKey) {
      return NextResponse.json({
        error: 'Submissions are temporarily unavailable.',
        debug: 'Missing SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY',
      }, { status: 503 })
    }

    const keyRole = decodeJwtRole(writeKey)
    if (
      SERVICE_ROLE_KEY
      && (SERVICE_ROLE_KEY.startsWith('sb_publishable_') || (keyRole && keyRole !== 'service_role'))
    ) {
      console.error('[forms/submit] SUPABASE_SERVICE_ROLE_KEY is not a service_role secret', keyRole)
      return NextResponse.json({
        error: 'The server key cannot write submissions. On Vercel set SUPABASE_SERVICE_ROLE_KEY to the service_role secret, not the anon key.',
        debug: `key role=${keyRole || 'publishable'}`,
      }, { status: 503 })
    }

    let callerId: string | null = null
    if (callerToken && ANON_KEY) {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { data: caller } = await authClient.auth.getUser(callerToken)
      callerId = caller.user?.id || null
    }

    const writer = createClient<Database>(SUPABASE_URL, writeKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    try {
      const data = await persistPublicFormSubmission({
        supabase: writer,
        formId,
        answers: answers as Record<string, unknown>,
        callerId,
      })

      void flushEmailQueue().catch((error) => {
        console.error('[email] immediate flush failed:', error)
      })

      return NextResponse.json({ data, error: null, debug: null })
    } catch (error) {
      if (error instanceof PublicFormSubmitError) {
        console.error('[forms/submit] persist rejected:', error.message, error.debug)
        return NextResponse.json(
          { error: error.message, debug: error.debug || null },
          { status: error.status },
        )
      }
      const message = error instanceof Error ? error.message : String(error)
      console.error('[forms/submit] persist failed:', message)
      return NextResponse.json({ error: mapPublicFormSubmitError(message), debug: message }, { status: 400 })
    }
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    )
  }
}
