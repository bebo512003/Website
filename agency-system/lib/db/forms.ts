/**
 * forms repository — data access for the forms domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, PageQuery, PageResult, pagedFail, escapeFilterValue, executePage } from './shared'
import { validateFile, sanitizeFileName, STORAGE_RULES } from '../storage-config'
import type { Client, FormQuestion, FormSubmission, FormTemplate, Project, ProjectPriority, ProjectStatus, SubmissionStatus } from '../supabase/types'
// Dynamic form builder

const slugifyForm = (title: string) => {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${base || 'form'}-${suffix}`
}


export async function getFormTemplates(): Promise<Result<import('../supabase/types').FormTemplateWithCounts[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_questions(count), form_submissions(count)')
    .order('updated_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as import('../supabase/types').FormTemplateWithCounts[])
}


export type FormTemplateListFilter = {
  search?: string
  status?: 'all' | import('../supabase/types').FormTemplate['status']
  sort?: 'updated' | 'created' | 'title'
}


/** Server-side search, status filter, sort, and pagination for the admin form
 * inventory. Question/submission counts stay as embedded aggregates. */

export async function getFormTemplatesPage(
  filter: FormTemplateListFilter & PageQuery = {}
): Promise<PageResult<import('../supabase/types').FormTemplateWithCounts>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25, sort = 'updated' } = filter
  let query = supabase
    .from('form_templates')
    .select('*, form_questions(count), form_submissions(count)', { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) query = query.or(`title.ilike.*${q}*,description.ilike.*${q}*`)
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)

  if (sort === 'created') query = query.order('created_at', { ascending: false })
  else if (sort === 'title') query = query.order('title')
  else query = query.order('updated_at', { ascending: false })

  return executePage<import('../supabase/types').FormTemplateWithCounts>(query, page, pageSize)
}


/**
 * Public form inventory. Keep this separate from the admin inventory even
 * though RLS also filters rows: a signed-in form manager visiting a public page
 * must never make drafts, disabled forms, or archived forms appear there.
 */



export async function getFormTemplateById(id: string): Promise<Result<import('../supabase/types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_templates').select('*').eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok(data as unknown as FormTemplate | null)
}


/** Resolve a public form link only while the form is published.
 * The explicit status predicate is intentional defence-in-depth for staff
 * sessions, which can otherwise read every lifecycle state through RLS. */



export async function createFormTemplate(input: { title: string; description?: string | null }): Promise<Result<import('../supabase/types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const payload: import('../supabase/types').FormTemplateInsert = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    slug: slugifyForm(input.title),
  }
  const { data, error } = await supabase.from('form_templates').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as FormTemplate | null)
}


export async function updateFormTemplate(id: string, updates: import('../supabase/types').FormTemplateUpdate): Promise<Result<import('../supabase/types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_templates').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as FormTemplate | null)
}


export async function deleteFormTemplate(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('form_templates').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function duplicateFormTemplate(id: string): Promise<Result<import('../supabase/types').FormTemplate | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('duplicate_form_template', { p_form_id: id })
  return error ? fail(null, error.message) : ok(data as unknown as FormTemplate | null)
}


export async function getFormQuestions(formId: string): Promise<Result<import('../supabase/types').FormQuestion[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('form_questions').select('*').eq('form_id', formId).order('position').order('created_at')
  return error ? fail([], error.message) : ok((data || []) as unknown as FormQuestion[])
}


export async function createFormQuestion(question: import('../supabase/types').FormQuestionInsert): Promise<Result<import('../supabase/types').FormQuestion | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_questions').insert(question).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as FormQuestion | null)
}


export async function updateFormQuestion(id: string, updates: import('../supabase/types').FormQuestionUpdate): Promise<Result<import('../supabase/types').FormQuestion | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('form_questions').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as FormQuestion | null)
}


export async function deleteFormQuestion(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('form_questions').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function reorderFormQuestions(formId: string, orderedQuestionIds: string[]): Promise<Result<number | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('reorder_form_questions', { p_form_id: formId, p_question_ids: orderedQuestionIds })
  return error ? fail(null, error.message) : ok(data)
}




export async function getPublicSubmissionTracking(trackingKey: string): Promise<Result<import('../supabase/types').PublicSubmissionTracking | null>> {
  if (!supabase) return fail(null)
  const cleanKey = trackingKey.trim()
  if (!cleanKey) return fail(null, 'Please provide a valid reference number or tracking token.')
  const { data, error } = await supabase.rpc('get_public_submission_tracking', { p_tracking_key: cleanKey })
  if (error) return fail(null, error.message)
  if (!data) return fail(null, 'No submission found matching this reference number or tracking link.')
  return ok(data as unknown as import('../supabase/types').PublicSubmissionTracking)
}


export async function getFormSubmissions(formId: string): Promise<Result<import('../supabase/types').FormSubmission[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('form_submissions').select('*').eq('form_id', formId).order('submitted_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as FormSubmission[])
}




/** Submission inbox row: the submission joined to its form title and its
 * current reviewer/owner (internal team member). */

export type AdminSubmissionRow = import('../supabase/types').FormSubmission & {
  form_templates?: { title: string; slug: string } | null
  reviewer?: Pick<import('../supabase/types').Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
}




export type SubmissionInboxFilter = {
  search?: string
  status?: 'all' | 'assigned_to_me' | SubmissionStatus
  reviewer?: 'all' | 'assigned_to_me' | 'unassigned' | string
  formId?: string
  sort?: 'newest' | 'oldest' | 'status'
}


/** Server-side search, filters, workflow-priority sort, and pagination for the
 * submission review inbox. Runs through the `get_submission_inbox_page`
 * SECURITY INVOKER RPC so search covers the form title and reviewer name too,
 * the "workflow priority" sort stays correct across pages, and the exact total
 * comes back in the same round trip. RLS still applies to every row read. */

export async function getSubmissionInboxPage(
  filter: SubmissionInboxFilter & PageQuery = {}
): Promise<PageResult<AdminSubmissionRow>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25 } = filter

  let reviewerId: string | null = null
  let reviewerMode: 'assigned_to_me' | 'unassigned' | null = null
  if (filter.reviewer === 'assigned_to_me' || filter.reviewer === 'unassigned') reviewerMode = filter.reviewer
  else if (filter.reviewer && filter.reviewer !== 'all') reviewerId = filter.reviewer

  const { data, error } = await supabase.rpc('get_submission_inbox_page', {
    p_search: filter.search?.trim() || null,
    p_status: filter.status && filter.status !== 'all' ? filter.status : null,
    p_reviewer_mode: reviewerMode,
    p_reviewer_id: reviewerId,
    p_form_id: filter.formId && filter.formId !== 'all' ? filter.formId : null,
    p_sort: filter.sort || 'newest',
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) return pagedFail(page, pageSize, error.message)
  const payload = (data || {}) as { data?: unknown; total?: number }
  return {
    data: (payload.data as AdminSubmissionRow[]) || [],
    total: payload.total || 0,
    page,
    pageSize,
    error: null,
  }
}


export type SubmissionPipelineCounts = {
  byStatus: Record<string, number>
  assignedToMe: number
  total: number
}


/** Pipeline summary counts for the submission inbox — aggregated entirely in
 * the database, never by shipping the full inbox to the browser. */

export async function getSubmissionPipelineCounts(): Promise<Result<SubmissionPipelineCounts>> {
  if (!supabase) return fail({ byStatus: {}, assignedToMe: 0, total: 0 })
  const { data, error } = await supabase.rpc('get_submission_pipeline_counts')
  if (error) return fail({ byStatus: {}, assignedToMe: 0, total: 0 }, error.message)
  const payload = (data || {}) as { total?: number; by_status?: Record<string, number> | null; assigned_to_me?: number }
  return ok({
    byStatus: payload.by_status || {},
    assignedToMe: payload.assigned_to_me || 0,
    total: payload.total || 0,
  })
}


export async function getAdminInboxSubmission(id: string): Promise<Result<AdminSubmissionRow | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, form_templates(title, slug), reviewer:profiles!form_submissions_reviewer_id_fkey(id, full_name, email, avatar_url, job_title)')
    .eq('id', id)
    .maybeSingle()
  return error ? fail(null, error.message) : ok(data as unknown as AdminSubmissionRow | null)
}


export async function getFormSubmissionDetails(submissionId: string): Promise<Result<{
  answers: import('../supabase/types').FormSubmissionAnswer[]
  attachments: import('../supabase/types').FormSubmissionAttachment[]
  notes: import('../supabase/types').FormSubmissionNote[]
  events: import('../supabase/types').FormSubmissionEvent[]
}>> {
  if (!supabase) return fail({ answers: [], attachments: [], notes: [], events: [] })
  const [answersResult, attachmentsResult, notesResult, eventsResult] = await Promise.all([
    supabase.from('form_submission_answers').select('*').eq('submission_id', submissionId).order('created_at'),
    supabase.from('form_submission_attachments').select('*').eq('submission_id', submissionId).order('created_at'),
    supabase
      .from('form_submission_notes')
      .select('*, author:profiles!form_submission_notes_author_id_fkey(id, full_name, email, avatar_url, job_title)')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false }),
    supabase
      .from('form_submission_events')
      .select('*, actor:profiles!form_submission_events_actor_id_fkey(id, full_name, email, avatar_url, job_title)')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false }),
  ])
  if (answersResult.error) return fail({ answers: [], attachments: [], notes: [], events: [] }, answersResult.error.message)
  if (attachmentsResult.error) return fail({ answers: [], attachments: [], notes: [], events: [] }, attachmentsResult.error.message)
  return ok({
    answers: answersResult.data || [],
    attachments: attachmentsResult.data || [],
    notes: (notesResult.data || []) as unknown as import('../supabase/types').FormSubmissionNote[],
    events: (eventsResult.data || []) as unknown as import('../supabase/types').FormSubmissionEvent[],
  })
}




export async function addFormSubmissionNote(submissionId: string, note: string): Promise<Result<import('../supabase/types').FormSubmissionNote | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_form_submission_note', {
    p_submission_id: submissionId,
    p_note: note,
  })
  return error ? fail(null, error.message) : ok(data as unknown as import('../supabase/types').FormSubmissionNote)
}


export async function deleteFormSubmissionNote(noteId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('delete_form_submission_note', {
    p_note_id: noteId,
  })
  return error ? fail(false, error.message) : ok(true)
}




export type SubmissionProjectConversionInput = {
  submissionId: string
  clientId: string | null
  newClient: {
    name: string
    type: Client['type']
    contact_person: string | null
    email: string | null
    phone: string | null
  } | null
  projectName: string
  description: string | null
  projectType: string
  priority: ProjectPriority
  status: ProjectStatus
  phase: number
  phaseName: string | null
  startDate: string | null
  dueDate: string | null
  budget: number | null
  currency: string
  ownerId: string
  managerId: string | null
  teamMemberIds: string[]
}


export async function convertSubmissionToProject(
  input: SubmissionProjectConversionInput
): Promise<Result<Project | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('convert_submission_to_project', {
    p_submission_id: input.submissionId,
    p_client_id: input.clientId,
    p_new_client: input.newClient as import('../supabase/types').Json | null,
    p_project_name: input.projectName,
    p_description: input.description,
    p_project_type: input.projectType,
    p_priority: input.priority,
    p_status: input.status,
    p_phase: input.phase,
    p_phase_name: input.phaseName,
    p_start_date: input.startDate,
    p_due_date: input.dueDate,
    p_budget: input.budget,
    p_currency: input.currency,
    p_owner_id: input.ownerId,
    p_manager_id: input.managerId,
    p_team_member_ids: input.teamMemberIds,
  })
  return error ? fail(null, error.message) : ok(data as unknown as Project)
}


export async function updateFormSubmissionStatus(
  id: string,
  status: import('../supabase/types').SubmissionStatus,
  note?: string
): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('update_form_submission_status', {
    p_submission_id: id,
    p_status: status,
    p_note: note?.trim() || null,
  })
  return error ? fail(false, error.message) : ok(true)
}


export async function assignFormSubmissionReviewer(
  id: string,
  reviewerId: string | null,
  note?: string
): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('assign_form_submission_reviewer', {
    p_submission_id: id,
    p_reviewer_id: reviewerId,
    p_note: note?.trim() || null,
  })
  return error ? fail(false, error.message) : ok(true)
}


export async function uploadFormFile(userId: string | null | undefined, file: File): Promise<Result<import('@/lib/forms/question-types').UploadedFileMeta | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'form-files')
  if (!validation.valid) return fail(null, validation.error || 'Invalid form attachment.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  // When no anonymous session is available (older GoTrue without Anonymous
  // Sign-ins) files land in the shared `anon/` folder permitted by RLS.
  const folder = userId || 'anon'
  const storagePath = `${folder}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('form-files').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (upload.error) return fail(null, upload.error.message)
  return ok({ storage_path: storagePath, name: file.name, size: file.size, mime_type: file.type || null })
}


export async function getFormFileUrl(storagePath: string, expiresIn = STORAGE_RULES['form-files'].signedUrlDurationSeconds || 120): Promise<Result<string | null>> {
  if (!supabase || !storagePath) return fail(null)
  const { data, error } = await supabase.storage.from('form-files').createSignedUrl(storagePath, expiresIn)
  return error ? fail(null, error.message) : ok(data.signedUrl)
}

