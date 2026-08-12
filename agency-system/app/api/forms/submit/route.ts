import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { flushEmailQueue } from '@/lib/email/flush'

// ── POST /api/forms/submit ───────────────────────────────────────────────────
// Server-side gateway for public form submissions. Performs:
//   1. IP-based rate limiting (in-memory, per-IP sliding window)
//   2. Cloudflare Turnstile token verification (when configured)
//   3. Payload size pre-check
//   4. Proxies to the hardened submit_dynamic_form RPC with the caller's
//      auth token so auth.uid() resolves to the anonymous session.
//
// The database RPC adds its own layer of rate limiting (per-session),
// duplicate detection (per-email), and payload validation.
//
// Env vars (server-only):
//   TURNSTILE_SECRET_KEY   — Cloudflare Turnstile secret
//   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — used only for Turnstile verification;
//                                the RPC itself runs under the caller's token.

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

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
    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Your session has expired. Please refresh the page.' }, { status: 401 })
    }

    // 5. Turnstile verification (when configured)
    if (TURNSTILE_SECRET) {
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

    // 7. Call the hardened Supabase RPC under the caller's auth context.
    //    Using the caller's access token ensures auth.uid() inside the RPC
    //    resolves to the anonymous session, preserving rate-limit tracking
    //    and created_by attribution.
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
    }

    const supabase = createClient(SUPABASE_URL, accessToken, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase.rpc('submit_dynamic_form', {
      p_form_id: formId,
      p_answers: answers as Record<string, unknown>,
    })

    if (error) {
      // Sanitize error messages for public consumption.
      // Map known Postgres exceptions to friendly messages; hide everything else.
      const msg = error.message || ''
      const friendly =
        /too frequently/i.test(msg) ? 'You are submitting too frequently. Please wait a moment and try again.' :
        /already submitted/i.test(msg) ? 'You have already submitted a response recently. Please wait a few minutes.' :
        /wait a few seconds/i.test(msg) ? 'Please wait a few seconds before submitting again.' :
        /not accepting submissions/i.test(msg) ? 'This form is no longer accepting submissions.' :
        /not found/i.test(msg) ? 'This form could not be found.' :
        /too large/i.test(msg) ? 'Your submission is too large. Please shorten your answers.' :
        /exceeds the maximum/i.test(msg) ? 'One of your answers is too long.' :
        /Required questions/i.test(msg) ? msg : // safe to show
        /Invalid option/i.test(msg) ? 'One of your answers contains an invalid option.' :
        /Invalid number/i.test(msg) ? 'Please enter a valid number.' :
        /Invalid rating/i.test(msg) ? 'Please provide a valid rating.' :
        /Invalid file/i.test(msg) ? 'There was a problem with your file upload.' :
        /Too many files/i.test(msg) ? 'You have uploaded too many files. Maximum is 10 per question.' :
        'Something went wrong. Please try again.'

      return NextResponse.json({ error: friendly }, { status: 400 })
    }

    // Transactional emails (submission receipt to the respondent + new
    // submission to staff) were enqueued by the database trigger inside the
    // same transaction. Flush them right away as a best effort — the
    // scheduled /api/cron/emails job is the guarantee.
    void flushEmailQueue().catch((error) => {
      console.error('[email] immediate flush failed:', error)
    })

    return NextResponse.json({ data, error: null })
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    )
  }
}
