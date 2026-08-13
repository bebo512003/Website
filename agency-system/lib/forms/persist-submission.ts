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
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PublicFormSubmitError'
    this.status = status
  }
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
    if (!fingerprintReadError) {
      await supabase.from('form_submission_fingerprints').insert({ form_id: formId, fingerprint })
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
          created_by: callerId,
        })
        .select('id')
        .maybeSingle()
      clientId = createdClient?.id ?? null
    }
  }

  const referenceNumber = generateSubmissionReference()
  const trackingToken = generateTrackingToken()
  const basePayload = {
    form_id: formId,
    form_version: form.version,
    status: 'new',
    respondent_name: validated.respondentName,
    respondent_email: validated.respondentEmail,
    respondent_phone: validated.respondentPhone,
    company_name: validated.companyName,
    client_id: clientId,
    created_by: callerId,
  }

  let submission = await insertSubmission(supabase, {
    ...basePayload,
    reference_number: referenceNumber,
    tracking_token: trackingToken,
  })

  if (!submission.ok && /reference_number|tracking_token|Could not find/i.test(submission.error)) {
    submission = await insertSubmission(supabase, basePayload)
  }
  if (!submission.ok && /status|check constraint/i.test(submission.error)) {
    submission = await insertSubmission(supabase, {
      ...basePayload,
      status: 'submitted',
      reference_number: referenceNumber,
      tracking_token: trackingToken,
    })
  }
  if (!submission.ok) {
    throw new PublicFormSubmitError(mapPublicFormSubmitError(submission.error))
  }

  const answerRows = validated.visibleQuestions.map((question) => ({
    submission_id: submission.row.id,
    question_id: question.id,
    question_snapshot: question as unknown as Json,
    value: (answers[question.id] ?? null) as Json,
  }))

  if (answerRows.length) {
    const { error: answerError } = await supabase.from('form_submission_answers').insert(answerRows)
    if (answerError) {
      await supabase.from('form_submissions').delete().eq('id', submission.row.id)
      throw new PublicFormSubmitError(mapPublicFormSubmitError(answerError.message))
    }
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

  return {
    ...submission.row,
    reference_number: submission.row.reference_number || referenceNumber,
    tracking_token: submission.row.tracking_token || trackingToken,
  }
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
  if (error || !data) return { ok: false, error: error?.message || 'Insert failed' }
  return { ok: true, row: data as unknown as FormSubmissionRow }
}
