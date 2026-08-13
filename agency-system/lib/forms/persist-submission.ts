import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { FormQuestion, FormSubmissionRow } from '@/lib/supabase/types'
import {
  isQuestionVisible,
  ratingMax,
  type AnswerMap,
  type AnswerValue,
  type UploadedFileMeta,
} from '@/lib/forms/question-types'

// Server-side persist for public form submissions.
//
// Production was returning the generic "Something went wrong" because
// submit_dynamic_form (SECURITY DEFINER, search_path = public) calls
// digest() / the reference-number default calls gen_random_bytes() —
// both live in the extensions schema on hosted Supabase. Every branding
// submit includes an email, so digest() always ran and rolled the save
// back. This path never calls that RPC: it writes the rows with the
// service role and generates REQ-… in Node.

const MAX_ANSWERS_CHARS = 102_400
const MAX_TEXT_CHARS = 10_000
const MAX_FILES_PER_QUESTION = 10
const MAX_FILE_BYTES = 20 * 1024 * 1024
const UNSAFE_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi',
  'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1',
])

export class PublicFormSubmitError extends Error {
  status: number
  debug?: string
  constructor(message: string, status = 400, debug?: string) {
    super(message)
    this.name = 'PublicFormSubmitError'
    this.status = status
    this.debug = debug
  }
}

export function formatPostgrestError(error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined): string {
  if (!error) return 'Insert failed'
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ')
}

export function describePersistFailure(message: string): string {
  const msg = message || ''
  if (/row-level security|42501/i.test(msg)) {
    return 'The server key cannot write submissions. On Vercel set SUPABASE_SERVICE_ROLE_KEY to the service_role secret, not the anon key.'
  }
  if (/form_submissions_status_check|invalid input value for enum/i.test(msg)) {
    return 'The form status column rejected the save. Please try again in a moment.'
  }
  if (/created_by|foreign key/i.test(msg)) {
    return 'A related record blocked the save. Please try again in a moment.'
  }
  return mapPublicFormSubmitError(msg)
}

export function mapPublicFormSubmitError(message: string): string {
  const msg = message || ''
  if (/too frequently/i.test(msg)) return 'You are submitting too frequently. Please wait a moment and try again.'
  if (/already submitted/i.test(msg)) return 'You have already submitted a response recently. Please wait a few minutes.'
  if (/wait a few seconds/i.test(msg)) return 'Please wait a few seconds before submitting again.'
  if (/not accepting submissions/i.test(msg)) return 'This form is no longer accepting submissions.'
  if (/not found/i.test(msg)) return 'This form could not be found.'
  if (/too large/i.test(msg)) return 'Your submission is too large. Please shorten your answers.'
  if (/exceeds the maximum/i.test(msg)) return 'One of your answers is too long.'
  if (/Required questions/i.test(msg)) return msg
  if (/Invalid option/i.test(msg)) return 'One of your answers contains an invalid option.'
  if (/Invalid number/i.test(msg)) return 'Please enter a valid number.'
  if (/Invalid rating/i.test(msg)) return 'Please provide a valid rating.'
  if (/Invalid file|unsafe file|exceeds maximum allowed size/i.test(msg)) return 'There was a problem with your file upload.'
  if (/Too many files/i.test(msg)) return 'You have uploaded too many files. Maximum is 10 per question.'
  if (/row-level security/i.test(msg)) {
    return 'The server key cannot write submissions. On Vercel set SUPABASE_SERVICE_ROLE_KEY to the service_role secret, not the anon key.'
  }
  if (/null value|not-null|foreign key|violates/i.test(msg)) return 'Your answers could not be saved. Please try again in a moment.'
  if (/No API key/i.test(msg)) return 'Submissions are temporarily unavailable. Please refresh and try again.'
  if (/JWT|expired|invalid claim|invalid token/i.test(msg)) return 'Your session expired. Refresh the page and try again.'
  if (/digest|gen_random_bytes|function .* does not exist/i.test(msg)) return 'Your answers could not be saved. Please try again in a moment.'
  return 'Something went wrong. Please try again.'
}

export function generateSubmissionReference(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2)
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `REQ-${yy}${mm}-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`
}

export function generateTrackingToken(): string {
  return randomBytes(24).toString('hex')
}

export function fingerprintEmail(email: string, formId: string): string {
  return createHash('sha256').update(`${email}${formId}`).digest('hex')
}

function asAnswerMap(answers: Record<string, unknown>): AnswerMap {
  return answers as AnswerMap
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function stringOptions(question: FormQuestion): string[] {
  return Array.isArray(question.options)
    ? question.options.filter((item): item is string => typeof item === 'string')
    : []
}

function asFileList(value: unknown): UploadedFileMeta[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is UploadedFileMeta => (
    !!item
    && typeof item === 'object'
    && typeof (item as UploadedFileMeta).storage_path === 'string'
  ))
}

function allowedStoragePath(path: string, callerId: string | null): boolean {
  if (!path || path.includes('..')) return false
  const folder = path.split('/')[0] || ''
  return folder === 'anon' || (!!callerId && folder === callerId)
}

export function validatePublicFormAnswers(
  questions: FormQuestion[],
  answers: Record<string, unknown>,
): {
  respondentName: string | null
  respondentEmail: string | null
  respondentPhone: string | null
  companyName: string | null
  visibleQuestions: FormQuestion[]
} {
  const encoded = JSON.stringify(answers)
  if (encoded.length > MAX_ANSWERS_CHARS) {
    throw new PublicFormSubmitError('Your submission is too large. Please shorten your answers.', 413)
  }
  for (const value of Object.values(answers)) {
    if (typeof value === 'string' && value.length > MAX_TEXT_CHARS) {
      throw new PublicFormSubmitError('One of your answers exceeds the maximum allowed length.', 413)
    }
  }

  const values = asAnswerMap(answers)
  const missing: string[] = []
  let respondentName: string | null = null
  let respondentEmail: string | null = null
  let respondentPhone: string | null = null
  let companyName: string | null = null
  const visibleQuestions: FormQuestion[] = []

  const ordered = [...questions].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  for (const question of ordered) {
    if (!isQuestionVisible(question, values)) continue
    visibleQuestions.push(question)
    const raw = answers[question.id]
    const empty = isEmptyValue(raw)
    if (question.required && empty) {
      missing.push(question.label)
      continue
    }
    if (empty) continue

    if (question.question_type === 'single_choice' || question.question_type === 'dropdown') {
      if (typeof raw !== 'string' || !stringOptions(question).includes(raw)) {
        throw new PublicFormSubmitError(`Invalid option for "${question.label}"`)
      }
    } else if (question.question_type === 'multiple_choice') {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string' || !stringOptions(question).includes(item))) {
        throw new PublicFormSubmitError(`Invalid option for "${question.label}"`)
      }
    } else if (question.question_type === 'yes_no') {
      if (raw !== 'yes' && raw !== 'no') {
        throw new PublicFormSubmitError(`Invalid answer for "${question.label}"`)
      }
    } else if (question.question_type === 'number') {
      if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^-?\d+(\.\d+)?$/.test(raw))) {
        throw new PublicFormSubmitError(`Invalid number for "${question.label}"`)
      }
    } else if (question.question_type === 'rating') {
      const score = Number(raw)
      const max = ratingMax(question.config)
      if (!Number.isInteger(score) || score < 1 || score > max) {
        throw new PublicFormSubmitError(`Invalid rating for "${question.label}"`)
      }
    } else if (question.question_type === 'file_upload') {
      if (!Array.isArray(raw)) {
        throw new PublicFormSubmitError(`Invalid file answer for "${question.label}"`)
      }
      if (raw.length > MAX_FILES_PER_QUESTION) {
        throw new PublicFormSubmitError(`Too many files uploaded for "${question.label}". Maximum is 10.`)
      }
      for (const item of raw) {
        const file = item && typeof item === 'object' ? item as Partial<UploadedFileMeta> : {}
        const name = typeof file.name === 'string' ? file.name : ''
        const size = typeof file.size === 'number' ? file.size : Number(file.size) || 0
        if (size > MAX_FILE_BYTES) {
          throw new PublicFormSubmitError(`Uploaded file "${name}" exceeds maximum allowed size of 20 MB.`)
        }
        const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
        if (UNSAFE_EXTENSIONS.has(ext)) {
          throw new PublicFormSubmitError(`Uploaded file "${name}" has an unsafe file extension and is rejected.`)
        }
      }
    }

    if (typeof raw === 'string') {
      const text = raw.trim()
      if (text) {
        if (question.map_to === 'name') respondentName = text
        if (question.map_to === 'email') respondentEmail = text.toLowerCase()
        if (question.map_to === 'phone') respondentPhone = text
        if (question.map_to === 'company') companyName = text
      }
    }
  }

  if (missing.length) {
    throw new PublicFormSubmitError(`Required questions are missing: ${missing.join(', ')}`)
  }

  return { respondentName, respondentEmail, respondentPhone, companyName, visibleQuestions }
}

type PersistInput = {
  supabase: SupabaseClient<Database>
  formId: string
  answers: Record<string, unknown>
  callerId: string | null
}

export async function persistPublicFormSubmission(input: PersistInput): Promise<FormSubmissionRow> {
  const { supabase, formId, answers, callerId } = input

  const { data: form, error: formError } = await supabase
    .from('form_templates')
    .select('id, title, status, version, settings')
    .eq('id', formId)
    .maybeSingle()

  if (formError) throw new PublicFormSubmitError(mapPublicFormSubmitError(formError.message), 400)
  if (!form) throw new PublicFormSubmitError('This form could not be found.', 404)
  if (form.status !== 'published') throw new PublicFormSubmitError('This form is no longer accepting submissions.', 400)

  const { data: questionRows, error: questionError } = await supabase
    .from('form_questions')
    .select('*')
    .eq('form_id', formId)
    .order('position')
    .order('created_at')

  if (questionError) throw new PublicFormSubmitError(mapPublicFormSubmitError(questionError.message), 400)
  const questions = (questionRows || []) as unknown as FormQuestion[]
  const validated = validatePublicFormAnswers(questions, answers)

  if (validated.respondentEmail) {
    const fingerprint = fingerprintEmail(validated.respondentEmail, formId)
    const windowStart = new Date(Date.now() - 5 * 60_000).toISOString()
    const { data: recent, error: fingerprintReadError } = await supabase
      .from('form_submission_fingerprints')
      .select('id')
      .eq('form_id', formId)
      .eq('fingerprint', fingerprint)
      .gt('submitted_at', windowStart)
      .limit(1)
    if (!fingerprintReadError && recent && recent.length > 0) {
      throw new PublicFormSubmitError('You have already submitted a response recently. Please wait a few minutes.')
    }
  }

  if (callerId) {
    await supabase.from('form_rate_limits').insert({ session_id: callerId, form_id: formId })
  }

  let clientId: string | null = null
  if (validated.respondentEmail) {
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .ilike('email', validated.respondentEmail)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existingClient?.id) {
      clientId = existingClient.id
    } else {
      const { data: createdClient } = await supabase
        .from('clients')
        .insert({
          name: validated.companyName || validated.respondentName || validated.respondentEmail,
          type: 'potential',
          status: 'potential',
          contact_person: validated.respondentName,
          email: validated.respondentEmail,
          phone: validated.respondentPhone,
          notes: `Created automatically from form "${form.title}"`,
        })
        .select('id')
        .maybeSingle()
      clientId = createdClient?.id ?? null
    }
  }

  const referenceNumber = generateSubmissionReference()
  const trackingToken = generateTrackingToken()
  const fingerprint = validated.respondentEmail ? fingerprintEmail(validated.respondentEmail, formId) : null
  const contact = {
    form_id: formId,
    respondent_name: validated.respondentName,
    respondent_email: validated.respondentEmail,
    respondent_phone: validated.respondentPhone,
    company_name: validated.companyName,
  }

  // Prefer the dedicated SECURITY DEFINER RPC: it inserts with
  // session_replication_role = replica so leftover AFTER INSERT triggers
  // cannot roll the save back. Works with either the service role or the
  // anon key once the migration is applied.
  const viaRpc = await insertViaSaveRpc(supabase, {
    formId,
    answers,
    referenceNumber,
    trackingToken,
    fingerprint,
  })
  let submission: { ok: true; row: FormSubmissionRow } | { ok: false; error: string } = viaRpc
  if (submission.ok) {
    console.info('[forms/persist] saved via save_public_form_submission')
  } else if (!/could not find the function|PGRST202|does not exist/i.test(submission.error)) {
    console.error('[forms/persist] save_public_form_submission failed:', submission.error)
  }

  // Never stamp created_by: an anonymous JWT is not a profiles row, and some
  // live databases still FK that column to profiles. Public saves must not
  // depend on it. Try modern columns first, then older shapes.
  if (!submission.ok) {
    const attempts: Database['public']['Tables']['form_submissions']['Insert'][] = [
      { ...contact, form_version: form.version, status: 'new', client_id: clientId, reference_number: referenceNumber, tracking_token: trackingToken },
      { ...contact, form_version: form.version, status: 'new', reference_number: referenceNumber, tracking_token: trackingToken },
      { ...contact, form_version: form.version, status: 'submitted', client_id: clientId, reference_number: referenceNumber, tracking_token: trackingToken },
      { ...contact, form_version: form.version, status: 'submitted', reference_number: referenceNumber, tracking_token: trackingToken },
      { ...contact, form_version: form.version, status: 'new', client_id: clientId },
      { ...contact, form_version: form.version, status: 'submitted', client_id: clientId },
      { ...contact, status: 'new' },
      { ...contact, status: 'submitted' },
      { form_id: formId, respondent_email: validated.respondentEmail, respondent_name: validated.respondentName },
    ]

    let firstError = submission.error
    for (const payload of attempts) {
      const attempt = await insertSubmission(supabase, payload)
      if (attempt.ok) {
        submission = attempt
        break
      }
      if (!firstError) firstError = attempt.error
      console.error('[forms/persist] insert attempt failed:', payload.status || 'default', attempt.error)
    }
    if (!submission.ok) {
      const combined = firstError && firstError !== submission.error
        ? `${firstError} :: later: ${submission.error}`
        : (firstError || submission.error)
      throw new PublicFormSubmitError(describePersistFailure(combined), 400, combined)
    }
  }

  // The dedicated RPC already wrote answers, fingerprint, events, and files.
  if (!viaRpc.ok) {
    const answerRows = validated.visibleQuestions.map((question) => ({
      submission_id: submission.row.id,
      question_id: question.id,
      question_snapshot: {
        id: question.id,
        label: question.label,
        question_type: question.question_type,
        required: question.required,
        options: question.options,
        map_to: question.map_to,
      } as unknown as Json,
      value: (answers[question.id] ?? null) as Json,
    }))

    if (answerRows.length) {
      const { error: answerError } = await supabase.from('form_submission_answers').insert(answerRows)
      if (answerError) {
        console.error('[forms/persist] answers insert failed:', answerError.message)
        const { error: simpleError } = await supabase.from('form_submission_answers').insert(
          validated.visibleQuestions.map((question) => ({
            submission_id: submission.row.id,
            question_id: question.id,
            question_snapshot: { label: question.label, question_type: question.question_type } as unknown as Json,
            value: (answers[question.id] ?? null) as Json,
          })),
        )
        if (simpleError) {
          console.error('[forms/persist] simplified answers insert failed:', simpleError.message)
        }
      }
    }

    if (validated.respondentEmail) {
      await supabase.from('form_submission_fingerprints').insert({
        form_id: formId,
        fingerprint: fingerprintEmail(validated.respondentEmail, formId),
      })
    }

    await supabase.from('form_submission_events').insert({
      submission_id: submission.row.id,
      actor_id: null,
      event_type: 'created',
      new_value: submission.row.status,
      note: 'Submission received',
      metadata: {
        form_version: form.version,
        form_title: form.title,
        respondent_email: validated.respondentEmail,
        reference_number: submission.row.reference_number,
      } as Json,
    })

    for (const question of validated.visibleQuestions) {
      if (question.question_type !== 'file_upload') continue
      for (const file of asFileList(answers[question.id] as AnswerValue)) {
        if (!allowedStoragePath(file.storage_path, callerId)) continue
        await supabase.from('form_submission_attachments').insert({
          submission_id: submission.row.id,
          question_id: question.id,
          name: file.name || 'file',
          size: file.size || 0,
          mime_type: file.mime_type,
          storage_path: file.storage_path,
          uploaded_by: callerId,
        })
      }
    }
  }

  return {
    ...submission.row,
    reference_number: submission.row.reference_number || referenceNumber,
    tracking_token: submission.row.tracking_token || trackingToken,
  }
}

async function insertViaSaveRpc(
  supabase: SupabaseClient<Database>,
  input: {
    formId: string
    answers: Record<string, unknown>
    referenceNumber: string
    trackingToken: string
    fingerprint: string | null
  },
): Promise<{ ok: true; row: FormSubmissionRow } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('save_public_form_submission', {
    p_form_id: input.formId,
    p_answers: input.answers as unknown as Json,
    p_reference_number: input.referenceNumber,
    p_tracking_token: input.trackingToken,
    p_fingerprint: input.fingerprint,
  })
  if (error || !data) return { ok: false, error: formatPostgrestError(error) || 'RPC insert failed' }
  return { ok: true, row: data as unknown as FormSubmissionRow }
}

async function insertSubmission(
  supabase: SupabaseClient<Database>,
  payload: Database['public']['Tables']['form_submissions']['Insert'],
): Promise<{ ok: true; row: FormSubmissionRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('form_submissions')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (error || !data) return { ok: false, error: formatPostgrestError(error) || 'Insert failed' }
  return { ok: true, row: data as unknown as FormSubmissionRow }
}
