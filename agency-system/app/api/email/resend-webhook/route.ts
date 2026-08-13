// Session 21 — Resend delivery-status webhook (server only).
//
// Receives signed events (sent / delivered / bounced / complained / …) and
// records them in `email_delivery_events`, updating the matching outbox row
// by provider_message_id. Signature verification uses Resend's Svix-style
// scheme; without a valid signature the request is rejected outright.

import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Verifies a Svix-signed webhook (the scheme Resend uses):
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`,
 * HMAC-SHA256 with the webhook secret, compared timing-safely against any of
 * the provided `v1,<base64>` signatures.
 */
function verifySignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return false

  const svixId = headers.get('svix-id') || ''
  const svixTimestamp = headers.get('svix-timestamp') || ''
  const svixSignature = headers.get('svix-signature') || ''
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = createHmac('sha256', secret).update(signedContent).digest('base64')

  const signatures = svixSignature
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3))

  return signatures.some((signature) => {
    try {
      const a = Buffer.from(signature, 'base64')
      const b = Buffer.from(expected, 'base64')
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  })
}

type ResendEvent = {
  type?: string
  data?: {
    email_id?: string
    to?: string[] | string
  }
}

export async function POST(request: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    return Response.json(
      { error: 'The webhook is not configured (RESEND_WEBHOOK_SECRET).' },
      { status: 503, headers: NO_STORE },
    )
  }

  const rawBody = await request.text()
  if (!verifySignature(rawBody, request.headers)) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401, headers: NO_STORE })
  }

  const service = getServiceClient()
  if (!service) {
    return Response.json(
      { error: 'Transactional email is not configured on the server.' },
      { status: 503, headers: NO_STORE },
    )
  }

  let event: ResendEvent
  try {
    event = JSON.parse(rawBody) as ResendEvent
  } catch {
    return Response.json({ error: 'Invalid webhook payload.' }, { status: 400, headers: NO_STORE })
  }

  const type = event.type || 'unknown'
  const messageId = event.data?.email_id ?? null
  const recipient = Array.isArray(event.data?.to) ? event.data?.to[0] : (event.data?.to ?? null)

  // Append-only provider log first (kept even if no outbox row matches).
  await service.from('email_delivery_events').insert({
    provider: 'resend',
    provider_message_id: messageId,
    event_type: type,
    recipient_email: recipient,
    payload: event,
  })

  // Update the matching outbox row — only by provider message id, never by
  // anything the webhook could spoof (like a recipient address).
  if (messageId) {
    if (type === 'email.delivered') {
      await service
        .from('email_outbox')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('provider_message_id', messageId)
        .eq('provider', 'resend')
    } else if (type === 'email.bounced' || type === 'email.complained') {
      await service
        .from('email_outbox')
        .update({ status: 'failed', last_error: `Provider reported: ${type}` })
        .eq('provider_message_id', messageId)
        .eq('provider', 'resend')
    }
  }

  return Response.json({ received: true }, { status: 200, headers: NO_STORE })
}
