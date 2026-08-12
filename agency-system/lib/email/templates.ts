// Session 21 — Branded transactional email templates.
//
// One shared layout renders every message so the brand stays consistent and
// the templates stay small. All dynamic values are HTML-escaped — payloads
// contain user-entered content (names, titles, feedback text) and must never
// be injected raw. Absolute links are built here from the server-side site
// URL; the database only stores relative paths.

import type { EmailTemplateKey, Json } from '@/lib/supabase/types'

export type EmailTemplateOptions = {
  siteUrl: string
  brandName: string
}

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

const BRAND_COLOR = '#0a0a0a'
const BODY_BG = '#f5f5f4'
const CARD_BG = '#ffffff'
const TEXT_COLOR = '#1c1c1c'
const MUTED_COLOR = '#6b6b6b'
const LINE_COLOR = '#e7e5e4'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function payloadValue(payload: Json, key: string): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return (payload as Record<string, unknown>)[key]
  }
  return undefined
}

function absoluteUrl(path: string | null | undefined, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  if (!path) return base
  if (/^https?:\/\//i.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

function formatDate(value: unknown): string {
  const raw = asText(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Shared branded layout ───────────────────────────────────────────────────
function brandLayout(opts: EmailTemplateOptions, content: {
  preheader: string
  eyebrow: string
  title: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  bodyText: string
}): { html: string; text: string } {
  const { siteUrl, brandName } = opts
  const ctaHtml = content.ctaLabel && content.ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
        <tr>
          <td align="left">
            <a href="${escapeHtml(absoluteUrl(content.ctaUrl, siteUrl))}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(content.ctaLabel)}</a>
          </td>
        </tr>
      </table>`
    : ''
  const ctaText = content.ctaLabel && content.ctaUrl
    ? `\n\n${content.ctaLabel}: ${absoluteUrl(content.ctaUrl, siteUrl)}`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BODY_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BODY_BG};">${escapeHtml(content.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BODY_BG};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background-color:${BRAND_COLOR};border-radius:12px 12px 0 0;padding:22px 32px;">
              <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.06em;">${escapeHtml(brandName)}</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CARD_BG};padding:32px;border:1px solid ${LINE_COLOR};border-top:none;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED_COLOR};">${escapeHtml(content.eyebrow)}</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${TEXT_COLOR};">${escapeHtml(content.title)}</h1>
              <div style="font-size:14px;line-height:1.65;color:${TEXT_COLOR};">${content.bodyHtml}</div>
              ${ctaHtml}
              <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${LINE_COLOR};font-size:12px;line-height:1.6;color:${MUTED_COLOR};">
                This is an automated message from ${escapeHtml(brandName)}.<br />
                If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${content.eyebrow.toUpperCase()}\n${content.title}\n\n${content.bodyText}${ctaText}\n\n—\nThis is an automated message from ${brandName}.`
  return { html, text }
}

function block(kind: 'info' | 'reference', label: string, value: unknown): string {
  const text = asText(value)
  if (!text) return ''
  if (kind === 'reference') {
    return `<p style="margin:20px 0;padding:14px 18px;background-color:#fafaf9;border:1px solid ${LINE_COLOR};border-radius:10px;font-size:14px;color:${TEXT_COLOR};">
      <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED_COLOR};margin-bottom:4px;">${escapeHtml(label)}</span>
      <span style="font-size:18px;font-weight:700;letter-spacing:0.04em;">${escapeHtml(text)}</span>
    </p>`
  }
  return `<p style="margin:10px 0;color:${TEXT_COLOR};"><span style="color:${MUTED_COLOR};">${escapeHtml(label)}:</span> ${escapeHtml(text)}</p>`
}

type TemplateBody = { subject: string; eyebrow: string; title: string; bodyHtml: string; bodyText: string; ctaLabel?: string; ctaUrl?: string }

function templateBody(key: EmailTemplateKey, payload: Json, opts: EmailTemplateOptions): TemplateBody {
  const projectName = asText(payloadValue(payload, 'project_name')) || 'your project'

  switch (key) {
    case 'submission-received': {
      const reference = asText(payloadValue(payload, 'reference_number')) || '—'
      const formName = asText(payloadValue(payload, 'form_name')) || 'form'
      const name = asText(payloadValue(payload, 'respondent_name'))
      const submittedAt = formatDate(payloadValue(payload, 'submitted_at'))
      return {
        subject: `We received your request — ${reference}`,
        eyebrow: 'Request received',
        title: `Thanks${name ? `, ${name}` : ''} — we got your request`,
        bodyHtml: `
          <p style="margin:0 0 12px;">Your ${escapeHtml(formName)} request has been received and is now in our queue. Here is your reference number:</p>
          ${block('reference', 'Your reference', reference)}
          ${submittedAt ? block('info', 'Submitted', submittedAt) : ''}
          <p style="margin:12px 0 0;">A member of our team will review your request and get back to you within <strong>1–2 business days</strong>. You can check progress at any time using the link below — no account needed.</p>`,
        bodyText: `Your ${formName} request has been received.\n\nReference: ${reference}${submittedAt ? `\nSubmitted: ${submittedAt}` : ''}\n\nWe will review your request and get back to you within 1–2 business days.`,
        ctaLabel: 'Track progress',
        ctaUrl: asText(payloadValue(payload, 'tracking_path')),
      }
    }

    case 'client-invitation': {
      const clientName = asText(payloadValue(payload, 'client_name'))
      return {
        subject: `Welcome to the ${opts.brandName} client portal`,
        eyebrow: 'Client portal',
        title: `Your client portal is ready${clientName ? `, ${clientName}` : ''}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">Your team has created a secure client portal account for you. Sign in to follow your projects, review shared files, see delivery updates, and approve work.</p>
          <p style="margin:12px 0 0;">Your sign-in details were shared with you separately by your account manager. If you have not received them, please reply to your latest conversation with our team.</p>`,
        bodyText: `Your client portal account is ready. Sign in to follow your projects, review shared files, see delivery updates, and approve work.\n\nYour sign-in details were shared with you separately by your account manager.`,
        ctaLabel: 'Open the portal',
        ctaUrl: asText(payloadValue(payload, 'portal_path')) || '/auth',
      }
    }

    case 'delivery-ready': {
      const version = asText(payloadValue(payload, 'version'))
      return {
        subject: `Your delivery is ready — ${projectName}`,
        eyebrow: 'Delivery ready',
        title: `Delivery ready: ${projectName}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">Good news — your team has delivered${version ? ` version ${escapeHtml(version)} of` : ''} <strong>${escapeHtml(projectName)}</strong>. It is now ready for your review.</p>
          <p style="margin:12px 0 0;">Open the portal to review the delivered files and either <strong>approve</strong> the work or <strong>request a revision</strong>.</p>`,
        bodyText: `Your team has delivered${version ? ` version ${version} of` : ''} “${projectName}”. It is now ready for your review.\n\nOpen the portal to review the files and approve the work or request a revision.`,
        ctaLabel: 'Review in the portal',
        ctaUrl: asText(payloadValue(payload, 'portal_path')),
      }
    }

    case 'revision-approval-update': {
      const action = asText(payloadValue(payload, 'action'))
      const note = asText(payloadValue(payload, 'note'))
      const isApproval = action === 'approved'
      return {
        subject: isApproval
          ? `Approval recorded — ${projectName}`
          : `Revision request received — ${projectName}`,
        eyebrow: isApproval ? 'Approval recorded' : 'Revision request received',
        title: isApproval
          ? `Your approval is recorded`
          : `We received your revision request`,
        bodyHtml: isApproval
          ? `<p style="margin:0 0 12px;">Thank you — your approval for <strong>${escapeHtml(projectName)}</strong> has been recorded. Your team has been notified and the project is moving to completion.</p>${note ? block('info', 'Your note', note) : ''}`
          : `<p style="margin:0 0 12px;">Thank you — we received your revision request for <strong>${escapeHtml(projectName)}</strong>. The project is back with the team and they are working on the changes now.</p>${note ? block('info', 'Your note', note) : ''}<p style="margin:12px 0 0;">You will get a new delivery email as soon as the revised work is ready for your review.</p>`,
        bodyText: isApproval
          ? `Thank you — your approval for “${projectName}” has been recorded. Your team has been notified and the project is moving to completion.${note ? `\n\nYour note: ${note}` : ''}`
          : `Thank you — we received your revision request for “${projectName}”. The project is back with the team.${note ? `\n\nYour note: ${note}` : ''}\n\nYou will get a new delivery email as soon as the revised work is ready.`,
        ctaLabel: 'Open the portal',
        ctaUrl: asText(payloadValue(payload, 'portal_path')),
      }
    }

    case 'new-submission': {
      const reference = asText(payloadValue(payload, 'reference_number')) || '—'
      const formName = asText(payloadValue(payload, 'form_name')) || 'a form'
      const clientName = asText(payloadValue(payload, 'client_name')) || 'A client'
      const company = asText(payloadValue(payload, 'company_name'))
      const submittedAt = formatDate(payloadValue(payload, 'submitted_at'))
      return {
        subject: `New submission ${reference} — ${formName}`,
        eyebrow: 'New submission',
        title: `New submission: ${formName}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">A new submission just arrived and is waiting in the inbox.</p>
          ${block('reference', 'Reference', reference)}
          ${block('info', 'Client', company ? `${clientName} · ${company}` : clientName)}
          ${submittedAt ? block('info', 'Submitted', submittedAt) : ''}`,
        bodyText: `A new submission just arrived for ${formName}.\n\nReference: ${reference}\nClient: ${company ? `${clientName} · ${company}` : clientName}${submittedAt ? `\nSubmitted: ${submittedAt}` : ''}`,
        ctaLabel: 'Open the submission',
        ctaUrl: asText(payloadValue(payload, 'inbox_path')),
      }
    }

    case 'task-assigned': {
      const taskTitle = asText(payloadValue(payload, 'task_title')) || 'a task'
      const dueDate = formatDate(payloadValue(payload, 'due_date'))
      const priority = asText(payloadValue(payload, 'priority'))
      return {
        subject: `You've been assigned: ${taskTitle}`,
        eyebrow: 'New task assignment',
        title: `Task assigned: ${taskTitle}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">A task has been assigned to you on <strong>${escapeHtml(projectName)}</strong>.</p>
          ${block('info', 'Project', projectName)}
          ${dueDate ? block('info', 'Due date', dueDate) : ''}
          ${priority ? block('info', 'Priority', priority) : ''}`,
        bodyText: `A task has been assigned to you on “${projectName}”.\n\nTask: ${taskTitle}${dueDate ? `\nDue date: ${dueDate}` : ''}${priority ? `\nPriority: ${priority}` : ''}`,
        ctaLabel: 'Open in My Work',
        ctaUrl: asText(payloadValue(payload, 'task_path')),
      }
    }

    case 'project-assigned': {
      const role = asText(payloadValue(payload, 'role')) || 'a team member'
      return {
        subject: `You're now ${role} on ${projectName}`,
        eyebrow: 'Project assignment',
        title: `You've been assigned to ${projectName}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">You have been added as <strong>${escapeHtml(role)}</strong> on <strong>${escapeHtml(projectName)}</strong>.</p>
          <p style="margin:12px 0 0;">Open the project to see the team, current status, tasks, and files.</p>`,
        bodyText: `You have been added as ${role} on “${projectName}”.\n\nOpen the project to see the team, current status, tasks, and files.`,
        ctaLabel: 'Open the project',
        ctaUrl: asText(payloadValue(payload, 'project_path')),
      }
    }

    case 'project-update': {
      const label = asText(payloadValue(payload, 'label')) || 'Client update'
      const summary = asText(payloadValue(payload, 'summary'))
      return {
        subject: `${label} — ${projectName}`,
        eyebrow: label,
        title: `${label}: ${projectName}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">There is a new client update on <strong>${escapeHtml(projectName)}</strong> that needs attention.</p>
          ${summary ? block('info', 'Message', summary.length > 280 ? `${summary.slice(0, 280)}…` : summary) : ''}`,
        bodyText: `There is a new client update on “${projectName}”.${summary ? `\n\nMessage: ${summary.length > 280 ? `${summary.slice(0, 280)}…` : summary}` : ''}`,
        ctaLabel: 'Open the project',
        ctaUrl: asText(payloadValue(payload, 'project_path')),
      }
    }
  }
}

export function renderEmailTemplate(
  key: EmailTemplateKey,
  payload: Json,
  options: EmailTemplateOptions,
): RenderedEmail {
  const body = templateBody(key, payload, options)
  const preheader = body.bodyText.replace(/\s+/g, ' ').slice(0, 120)
  const { html, text } = brandLayout(options, { ...body, preheader })
  return { subject: body.subject, html, text }
}
