// Session 21 — Transactional email queue flush (server only).
//
// The database triggers only ENQUEUE. This module is the only place that
// talks to the email provider (Resend). It:
//   1. expires rows stuck in `queued` for more than 72 hours,
//   2. claims a small batch with an optimistic status guard (two concurrent
//      workers can never send the same row),
//   3. renders the branded template, sends via the Resend REST API,
//   4. records the provider message id / status / retry backoff.
//
// Everything here requires the server-only RESEND_API_KEY and
// SUPABASE_SERVICE_ROLE_KEY — never import this module from browser code.

import { createClient } from '@supabase/supabase-js'
import type { Database, EmailOutboxRow, EmailTemplateKey, Json } from '@/lib/supabase/types'
import { renderEmailTemplate } from '@/lib/email/templates'

const RESEND_API_URL = 'https://api.resend.com/emails'
const BATCH_SIZE = 25
const MAX_ATTEMPTS = 6
const STALE_AFTER_MS = 72 * 60 * 60 * 1000
const MAX_BACKOFF_MINUTES = 30
const MAX_ERROR_LENGTH = 1000

export type FlushResult = {
  configured: boolean
  sent: number
  failed: number
  skipped: number
  remainingQueued: number
  error?: string
}

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!supabaseUrl || !serviceKey || !resendKey) return null
  return { supabaseUrl, serviceKey, resendKey }
}

export function getEmailIdentity() {
  const brandName = process.env.EMAIL_BRAND_NAME || 'Agency OS'
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev'
  const fromName = process.env.EMAIL_FROM_NAME || brandName
  return { brandName, fromAddress, fromName, from: `${fromName} <${fromAddress}>` }
}

export function getEmailSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, MAX_ERROR_LENGTH)
}

async function sendViaResend(apiKey: string, email: {
  from: string
  to: string
  subject: string
  html: string
  text: string
  messageId: string
}): Promise<string> {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      // Stable per-outbox-row id — lets Resend drop a retry that already
      // succeeded on the provider side.
      headers: { 'X-Entity-Ref-ID': email.messageId },
    }),
  })

  if (!response.ok) {
    let detail = `Resend rejected the message (HTTP ${response.status})`
    try {
      const body = (await response.json()) as { message?: string; name?: string }
      if (body.message) detail += `: ${body.message}`
      else if (body.name) detail += `: ${body.name}`
    } catch {
      // keep the generic message
    }
    throw new Error(detail)
  }

  const json = (await response.json()) as { id?: string }
  if (!json.id) throw new Error('Resend accepted the message but returned no id.')
  return json.id
}

/**
 * Sends one batch of queued emails. Idempotent and safe to run from any
 * scheduler (Vercel Cron → GET /api/cron/emails) or best-effort right after
 * a server-side mutation.
 */
export async function flushEmailQueue(): Promise<FlushResult> {
  const config = getServerConfig()
  if (!config) return { configured: false, sent: 0, failed: 0, skipped: 0, remainingQueued: 0 }

  const service = createClient<Database>(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const now = Date.now()
  const result: FlushResult = { configured: true, sent: 0, failed: 0, skipped: 0, remainingQueued: 0 }

  try {
    // 1. Expire rows that have been stuck in the queue for too long.
    await service
      .from('email_outbox')
      .update({ status: 'skipped', last_error: 'Expired: not sent within 72 hours.' })
      .eq('status', 'queued')
      .lt('created_at', new Date(now - STALE_AFTER_MS).toISOString())

    // 2. Fetch the next batch.
    const { data: batch, error: fetchError } = await service
      .from('email_outbox')
      .select('*')
      .eq('status', 'queued')
      .lte('next_attempt_at', new Date(now).toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchError) throw new Error(`Unable to read the email queue: ${fetchError.message}`)

    // 3. Claim each row optimistically. The `status = 'queued'` guard makes
    //    the claim atomic: if another worker claimed the row first, the
    //    update matches zero rows and we skip it.
    for (const row of (batch ?? [])) {
      const { data: claimedRows, error: claimError } = await service
        .from('email_outbox')
        .update({ status: 'sending', attempts: (row.attempts ?? 0) + 1 })
        .eq('id', row.id)
        .eq('status', 'queued')
        .select('*')

      if (claimError) {
        console.error(`[email] claim failed for ${row.id}: ${claimError.message}`)
        continue
      }
      const claimed = claimedRows?.[0] as EmailOutboxRow | undefined
      if (!claimed) continue

      try {
        await sendOutboxRow(service, config.resendKey, claimed)
        result.sent += 1
      } catch (error) {
        const message = truncateError(error)
        const attempts = claimed.attempts ?? 0

        if (attempts >= MAX_ATTEMPTS || isPermanentError(message)) {
          await service
            .from('email_outbox')
            .update({ status: 'failed', last_error: message })
            .eq('id', claimed.id)
          result.failed += 1
        } else {
          // Exponential backoff, capped at 30 minutes.
          const backoffMinutes = Math.min(2 ** attempts, MAX_BACKOFF_MINUTES)
          await service
            .from('email_outbox')
            .update({
              status: 'queued',
              last_error: message,
              next_attempt_at: new Date(now + backoffMinutes * 60_000).toISOString(),
            })
            .eq('id', claimed.id)
        }
      }
    }

    // 4. Report how much work remains for the next run.
    const { count, error: countError } = await service
      .from('email_outbox')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lte('next_attempt_at', new Date().toISOString())
    if (!countError) result.remainingQueued = count ?? 0
  } catch (error) {
    result.error = truncateError(error)
  }

  return result
}

function isPermanentError(message: string): boolean {
  // The provider rejected the address/template permanently — retrying will
  // not help. Everything else (network, 429, 5xx) backs off and retries.
  return (
    /invalid_parameter/i.test(message) ||
    /validation_error/i.test(message) ||
    /restricted_api_key/i.test(message) ||
    /not found/i.test(message)
  )
}

async function sendOutboxRow(
  service: ReturnType<typeof createClient<Database>>,
  apiKey: string,
  row: EmailOutboxRow,
): Promise<void> {
  const { brandName, from } = getEmailIdentity()
  const siteUrl = getEmailSiteUrl()

  const knownTemplate = row.template_key as EmailTemplateKey
  const rendered = renderEmailTemplate(knownTemplate, (row.payload ?? {}) as Json, { siteUrl, brandName })
  const providerMessageId = await sendViaResend(apiKey, {
    from,
    to: row.recipient_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: row.id,
  })

  const { error } = await service
    .from('email_outbox')
    .update({
      status: 'sent',
      provider: 'resend',
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', row.id)

  if (error) {
    // The email left our hands; only bookkeeping failed. Log instead of
    // retrying so the recipient never gets a duplicate.
    console.error(`[email] sent ${row.id} but failed to record status: ${error.message}`)
  }
}
