'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Inbox,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  createFormQuestion,
  deleteFormQuestion,
  deleteFormTemplate,
  duplicateFormTemplate,
  getFormFileUrl,
  getFormQuestions,
  getFormSubmissionDetails,
  getFormSubmissions,
  getFormTemplateById,
  reorderFormQuestions,
  updateFormQuestion,
  updateFormSubmissionStatus,
  updateFormTemplate,
} from '@/lib/supabase/database'
import type {
  FormQuestion,
  FormQuestionType,
  FormStatus,
  FormSubmission,
  FormSubmissionAnswer,
  FormSubmissionAttachment,
  FormTemplate,
  Json,
} from '@/lib/supabase/types'
import { QUESTION_TYPES, QUESTION_TYPE_MAP, formatAnswer, questionSection, ratingMax, showIfRule } from '@/lib/forms/question-types'
import { DynamicFormRenderer, type RendererLang } from '@/components/forms/dynamic-form-renderer'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

// ── Form builder ─────────────────────────────────────────────────────────────
// Full admin editor for one dynamic form: details, status lifecycle, questions
// (add/edit/delete/reorder/options), live preview, and the submissions inbox.

type Tab = 'build' | 'submissions'

type QuestionEditForm = {
  label: string
  help_text: string
  placeholder: string
  required: boolean
  map_to: string
  options: string[]
  rating_max: number
  section: string
  show_if_question_id: string
  show_if_value: string
}

const statusStyles: Record<FormStatus, string> = {
  draft: 'border-border text-text-tertiary',
  published: 'border-green-500/30 bg-green-500/5 text-green-400',
  disabled: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  archived: 'border-border bg-surface-raised text-text-tertiary',
}
const statusLabels: Record<FormStatus, string> = { draft: 'Draft', published: 'Enabled', disabled: 'Disabled', archived: 'Archived' }
const mapToLabels: Record<string, string> = { name: 'Respondent name', email: 'Respondent e-mail', phone: 'Respondent phone', company: 'Company name' }

const editFormFrom = (question: FormQuestion): QuestionEditForm => ({
  label: question.label,
  help_text: question.help_text || '',
  placeholder: question.placeholder || '',
  required: question.required,
  map_to: question.map_to || '',
  options: Array.isArray(question.options) ? question.options.filter((o): o is string => typeof o === 'string') : [],
  rating_max: ratingMax(question.config),
  section: questionSection(question.config),
  show_if_question_id: showIfRule(question.config)?.question_id || '',
  show_if_value: showIfRule(question.config)?.value || '',
})

export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { can } = useAuth()
  const canManage = can('form.manage')
  const canViewForm = canManage || can('form.view')
  const canViewSubmissions = can('submission.view')
  const allowed = canViewForm || canViewSubmissions

  const [tab, setTab] = useState<Tab>('build')
  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [questions, setQuestions] = useState<FormQuestion[]>([])
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [details, setDetails] = useState({ title: '', description: '', create_project_on_submit: false })
  const [savingDetails, setSavingDetails] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<QuestionEditForm | null>(null)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLang, setPreviewLang] = useState<RendererLang>('ar')
  const [previewValues, setPreviewValues] = useState({})

  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, { answers: FormSubmissionAnswer[]; attachments: FormSubmissionAttachment[] }>>({})
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const tabParam = sp.get('tab')
      const subParam = sp.get('submission')
      if (tabParam === 'submissions' || (!can('form.manage') && !can('form.view') && can('submission.view'))) setTab('submissions')
      if (subParam) {
        setExpandedId(subParam)
        void getFormSubmissionDetails(subParam).then((res) => {
          if (res.data) setDetailsCache((cache) => ({ ...cache, [subParam]: res.data }))
        })
      }
    }
  }, [])

  const load = useCallback(async () => {
    const [templateResult, questionsResult] = await Promise.all([getFormTemplateById(id), getFormQuestions(id)])
    if (!templateResult.data) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setTemplate(templateResult.data)
    setQuestions(questionsResult.data)
    if (templateResult.error || questionsResult.error) setError(templateResult.error || questionsResult.error || '')
    setDetails({
      title: templateResult.data.title,
      description: templateResult.data.description || '',
      create_project_on_submit: !!(templateResult.data.settings && typeof templateResult.data.settings === 'object' && !Array.isArray(templateResult.data.settings) && (templateResult.data.settings as Record<string, unknown>).create_project_on_submit),
    })
    setLoading(false)
  }, [id])

  useEffect(() => { if (allowed) void load(); else setLoading(false) }, [allowed, load])

  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true)
    const result = await getFormSubmissions(id)
    setSubmissions(result.data)
    if (result.error) setError(result.error)
    setSubmissionsLoading(false)
  }, [id])

  useEffect(() => { if (tab === 'submissions') void loadSubmissions() }, [tab, loadSubmissions])

  const flash = (text: string) => { setError(''); setMessage(text) }

  // ── Form-level actions ─────────────────────────────────────────────────────
  const saveDetails = async () => {
    if (!template || !details.title.trim()) return
    setSavingDetails(true)
    const result = await updateFormTemplate(template.id, {
      title: details.title.trim(),
      description: details.description.trim() || null,
      settings: { ...(template.settings && typeof template.settings === 'object' && !Array.isArray(template.settings) ? template.settings as Record<string, Json> : {}), create_project_on_submit: details.create_project_on_submit },
    })
    setSavingDetails(false)
    if (result.error) setError(result.error)
    else { flash('Form details saved.'); await load() }
  }

  const setStatus = async (status: FormStatus, success: string) => {
    if (!template) return
    setBusy(true)
    const result = await updateFormTemplate(template.id, { status })
    setBusy(false)
    if (result.error) setError(result.error)
    else { flash(success); await load() }
  }

  const duplicate = async () => {
    if (!template) return
    setBusy(true)
    const result = await duplicateFormTemplate(template.id)
    setBusy(false)
    if (result.error || !result.data) return setError(result.error || 'Duplication failed.')
    router.push(`/admin/forms/${result.data.id}`)
  }

  const removeForm = async () => {
    if (!template) return
    if (!window.confirm(`Delete “${template.title}” and all of its questions permanently? Forms with responses cannot be deleted (archive them instead).`)) return
    setBusy(true)
    const result = await deleteFormTemplate(template.id)
    setBusy(false)
    if (result.error) return setError(result.error)
    router.replace('/admin')
  }

  const copyLink = async () => {
    if (!template) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/f/${template.slug}`)
      flash('Public link copied to clipboard.')
    } catch {
      setError(`Copy failed — the link is /f/${template.slug}`)
    }
  }

  // ── Question actions ───────────────────────────────────────────────────────
  const addQuestion = async (type: FormQuestionType) => {
    if (!template) return
    setBusy(true)
    setError('')
    const meta = QUESTION_TYPE_MAP[type]
    const position = questions.reduce((max, q) => Math.max(max, q.position), 0) + 1
    const result = await createFormQuestion({
      form_id: template.id,
      question_type: type,
      label: meta.labelEn,
      position,
      options: (meta.defaultOptions || []) as Json,
      config: (meta.defaultConfig || {}) as Json,
    })
    setBusy(false)
    if (result.error || !result.data) return setError(result.error || 'Could not add the question.')
    flash(`${meta.labelEn} question added — edit its text below.`)
    setEditingId(result.data.id)
    setEditForm(editFormFrom(result.data))
    await load()
  }

  const startEdit = (question: FormQuestion) => {
    setEditingId(question.id)
    setEditForm(editFormFrom(question))
  }

  const saveQuestion = async () => {
    if (!editingId || !editForm) return
    const question = questions.find((q) => q.id === editingId)
    if (!question || !editForm.label.trim()) return
    setSavingQuestion(true)
    const meta = QUESTION_TYPE_MAP[question.question_type]
    const optionValues = editForm.options.map((o) => o.trim()).filter(Boolean)
    if (meta.hasOptions && optionValues.length === 0) {
      setSavingQuestion(false)
      return setError('Choice questions need at least one option.')
    }
    const config: Record<string, Json> = {}
    if (question.question_type === 'rating') config.rating_max = editForm.rating_max
    const section = editForm.section.trim()
    if (section) config.section = section
    if (editForm.show_if_question_id && editForm.show_if_value.trim()) {
      config.show_if = { question_id: editForm.show_if_question_id, value: editForm.show_if_value.trim() }
    }
    const result = await updateFormQuestion(editingId, {
      label: editForm.label.trim(),
      help_text: editForm.help_text.trim() || null,
      placeholder: meta.hasPlaceholder ? editForm.placeholder.trim() || null : null,
      required: editForm.required,
      map_to: (editForm.map_to || null) as FormQuestion['map_to'],
      options: (meta.hasOptions ? optionValues : []) as Json,
      config: config as Json,
    })
    setSavingQuestion(false)
    if (result.error) return setError(result.error)
    setEditingId(null)
    setEditForm(null)
    flash('Question saved. Existing responses keep their original question snapshot.')
    await load()
  }

  const removeQuestion = async (question: FormQuestion) => {
    if (!window.confirm(`Delete the question “${question.label}”? Answers already collected keep their snapshot.`)) return
    const result = await deleteFormQuestion(question.id)
    if (result.error) return setError(result.error)
    if (editingId === question.id) { setEditingId(null); setEditForm(null) }
    flash('Question deleted.')
    await load()
  }

  const move = async (index: number, direction: -1 | 1) => {
    if (!template) return
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    const next = [...questions]
    ;[next[index], next[target]] = [next[target], next[index]]
    setQuestions(next)
    const result = await reorderFormQuestions(template.id, next.map((q) => q.id))
    if (result.error) {
      setError(result.error)
      await load()
    }
  }

  // ── Submissions inbox ──────────────────────────────────────────────────────
  const toggleSubmission = async (submissionId: string) => {
    if (expandedId === submissionId) return setExpandedId(null)
    setExpandedId(submissionId)
    if (detailsCache[submissionId]) return
    setDetailsLoading(true)
    const result = await getFormSubmissionDetails(submissionId)
    setDetailsLoading(false)
    if (result.error) return setError(result.error)
    setDetailsCache((cache) => ({ ...cache, [submissionId]: result.data }))
  }

  const setSubmissionStatus = async (submission: FormSubmission, status: 'submitted' | 'archived') => {
    const result = await updateFormSubmissionStatus(submission.id, status)
    if (result.error) return setError(result.error)
    flash(status === 'archived' ? 'Response archived.' : 'Response restored.')
    await loadSubmissions()
  }

  const downloadAttachment = async (attachment: FormSubmissionAttachment) => {
    const result = await getFormFileUrl(attachment.storage_path)
    if (result.error || !result.data) return setError(result.error || 'Could not create a download link.')
    window.open(result.data, '_blank', 'noopener')
  }

  if (!allowed) {
    return <Page><PageHeader eyebrow="ADMIN / FORMS" title="Form builder" description="This area is restricted to form managers." /><Panel><EmptyState icon={ShieldCheck} title="Form permission required" description="Ask an administrator to grant “View forms” or “Manage forms”. You do not need the full system-admin permission." /></Panel></Page>
  }

  if (loading) return <Page><Panel><LoadingState label="Loading form builder…" /></Panel></Page>

  if (notFound || !template) {
    return <Page><PageHeader eyebrow="ADMIN / FORMS" title="Form builder" description="" /><Panel><EmptyState icon={ClipboardList} title="Form not found" description="It may have been deleted, or your role cannot manage forms." action={<Link href="/admin/forms" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to forms</Link>} /></Panel></Page>
  }

  const live = template.status === 'published'

  return (
    <Page>
      <PageHeader
        eyebrow="ADMIN / FORM BUILDER"
        title={template.title}
        description="Everything on this page is stored in the database — the respondent form renders exactly what you configure here. No code changes required."
        action={<Link href="/admin/forms" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> All forms</Link>}
      />

      {/* Status + lifecycle actions */}
      <Panel>
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded border px-2 py-1 text-xs font-medium ${statusStyles[template.status]}`}>{statusLabels[template.status]}</span>
            <span className="font-mono-tech text-[10px] text-text-tertiary">v{template.version} · /f/{template.slug}</span>
            {live && (
              <>
                <a href={`/f/${template.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
                <button onClick={() => void copyLink()} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-fg"><Link2 className="h-3.5 w-3.5" /> Copy link</button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin text-accent" />}
            <button onClick={() => setPreviewOpen(true)} className={secondaryButtonClassName}><Eye className="h-4 w-4" /> Preview</button>
            {canManage && !live ? (
              <button onClick={() => void setStatus('published', template.status === 'draft' ? 'Form is now live. Share its public link.' : 'Form re-enabled.')} disabled={busy} className={primaryButtonClassName}>Enable form</button>
            ) : null}
            {canManage && live ? (
              <button onClick={() => void setStatus('disabled', 'Form disabled. It no longer accepts responses, but existing responses are kept.')} disabled={busy} className={secondaryButtonClassName}>Disable</button>
            ) : null}
            {canManage && <button onClick={() => void duplicate()} disabled={busy} className={secondaryButtonClassName}><Copy className="h-4 w-4" /> Duplicate</button>}
            {canManage && template.status === 'archived' ? (
              <button onClick={() => void setStatus('draft', 'Form restored to draft.')} disabled={busy} className={secondaryButtonClassName}><ArchiveRestore className="h-4 w-4" /> Restore</button>
            ) : null}
            {canManage && template.status !== 'archived' ? (
              <button onClick={() => void setStatus('archived', 'Form archived. Its responses are kept and it no longer accepts new ones.')} disabled={busy} className={secondaryButtonClassName}><Archive className="h-4 w-4" /> Archive</button>
            ) : null}
            {canManage && <button onClick={() => void removeForm()} disabled={busy} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label="Delete form"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
      </Panel>

      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <div className="flex flex-wrap gap-2">
        {canViewForm && <button onClick={() => setTab('build')} className={tab === 'build' ? primaryButtonClassName : secondaryButtonClassName}><Pencil className="h-4 w-4" /> {canManage ? 'Build' : 'Questions'}</button>}
        {canViewSubmissions && <button onClick={() => setTab('submissions')} className={tab === 'submissions' ? primaryButtonClassName : secondaryButtonClassName}><Inbox className="h-4 w-4" /> Responses</button>}
      </div>

      {tab === 'build' && canViewForm && (
        <>
          {/* Details */}
          <Panel title="Form details" description="Shown to respondents at the top of the public form.">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-xs text-text-secondary">Title<input className={`${inputClassName} mt-2`} value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} /></label>
              <label className="flex items-end gap-2 pb-0.5 text-xs text-text-secondary">
                <input type="checkbox" checked={details.create_project_on_submit} onChange={(e) => setDetails({ ...details, create_project_on_submit: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--accent))]" />
                Auto-create a project when someone submits (needs a mapped e-mail question)
              </label>
              <label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-20`} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} /></label>
              {canManage && (
                <div className="flex justify-end sm:col-span-2">
                  <button onClick={() => void saveDetails()} disabled={savingDetails || !details.title.trim()} className={primaryButtonClassName}>{savingDetails && <LoaderCircle className="h-4 w-4 animate-spin" />}Save details</button>
                </div>
              )}
            </div>
          </Panel>

          {/* Questions list */}
          <Panel title="Questions" description="Respondents see the questions in this exact order. Required fields are enforced again on the server when a response is submitted.">
            {questions.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No questions yet" description="Add your first question from the picker below, then publish the form." />
            ) : (
              <div className="divide-y divide-border">
                {questions.map((question, index) => {
                  const meta = QUESTION_TYPE_MAP[question.question_type]
                  const Icon = meta.icon
                  const editing = editingId === question.id && editForm
                  return (
                    <div key={question.id} className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <button onClick={() => void move(index, -1)} disabled={index === 0 || busy} className="text-text-tertiary hover:text-fg disabled:opacity-30" aria-label="Move question up"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button onClick={() => void move(index, 1)} disabled={index === questions.length - 1 || busy} className="mt-1 text-text-tertiary hover:text-fg disabled:opacity-30" aria-label="Move question down"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-text-tertiary"><Icon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-fg">{question.label}</p>
                            {question.required && <span className="rounded border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] text-accent">required</span>}
                            {questionSection(question.config) && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">{questionSection(question.config)}</span>}
                            {showIfRule(question.config) && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">conditional</span>}
                            {question.map_to && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">maps to {mapToLabels[question.map_to]}</span>}
                          </div>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {meta.labelEn} · #{index + 1}
                            {Array.isArray(question.options) && question.options.length > 0 && ` · ${question.options.length} options`}
                            {question.question_type === 'rating' && ` · max ${ratingMax(question.config)}`}
                          </p>
                        </div>
                        {canManage && (
                          <button onClick={() => (editing ? (setEditingId(null), setEditForm(null)) : startEdit(question))} className="rounded-md border border-border p-2 text-text-tertiary hover:text-fg" aria-label={editing ? 'Close editor' : `Edit ${question.label}`}>
                            {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                          </button>
                        )}
                        {canManage && <button onClick={() => void removeQuestion(question)} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${question.label}`}><Trash2 className="h-4 w-4" /></button>}
                      </div>

                      {editing && (
                        <div className="mt-4 grid gap-4 rounded-md border border-border bg-surface-raised p-4 sm:grid-cols-2">
                          <label className="text-xs text-text-secondary sm:col-span-2">Question text<input className={`${inputClassName} mt-2`} value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} /></label>
                          <label className="text-xs text-text-secondary">Help text (optional)<input className={`${inputClassName} mt-2`} value={editForm.help_text} onChange={(e) => setEditForm({ ...editForm, help_text: e.target.value })} placeholder="Shown under the question" /></label>
                          {meta.hasPlaceholder ? (
                            <label className="text-xs text-text-secondary">Placeholder (optional)<input className={`${inputClassName} mt-2`} value={editForm.placeholder} onChange={(e) => setEditForm({ ...editForm, placeholder: e.target.value })} /></label>
                          ) : (
                            <label className="text-xs text-text-secondary">Map answer to (optional)
                              <select className={`${inputClassName} mt-2`} value={editForm.map_to} onChange={(e) => setEditForm({ ...editForm, map_to: e.target.value })}>
                                <option value="">Not mapped</option>
                                {Object.entries(mapToLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                          )}
                          {meta.hasPlaceholder && (
                            <label className="text-xs text-text-secondary">Map answer to (optional)
                              <select className={`${inputClassName} mt-2`} value={editForm.map_to} onChange={(e) => setEditForm({ ...editForm, map_to: e.target.value })}>
                                <option value="">Not mapped</option>
                                {Object.entries(mapToLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                          )}
                          {question.question_type === 'rating' && (
                            <label className="text-xs text-text-secondary">Rating scale
                              <select className={`${inputClassName} mt-2`} value={editForm.rating_max} onChange={(e) => setEditForm({ ...editForm, rating_max: Number(e.target.value) })}>
                                {[5, 10].map((max) => <option key={max} value={max}>1 – {max} stars</option>)}
                              </select>
                            </label>
                          )}
                          <label className="flex items-center gap-2 text-xs text-text-secondary">
                            <input type="checkbox" checked={editForm.required} onChange={(e) => setEditForm({ ...editForm, required: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--accent))]" />
                            Required question
                          </label>

                          <label className="text-xs text-text-secondary">
                            Section (optional)
                            <input className={`${inputClassName} mt-2`} value={editForm.section} onChange={(e) => setEditForm({ ...editForm, section: e.target.value })} placeholder="e.g. About You" />
                          </label>

                          <div className="text-xs text-text-secondary">
                            <p>Show only when (conditional)</p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                              <select
                                className={`${inputClassName} flex-1`}
                                value={editForm.show_if_question_id}
                                onChange={(e) => setEditForm({ ...editForm, show_if_question_id: e.target.value })}
                              >
                                <option value="">Always shown</option>
                                {questions
                                  .filter((other) => other.id !== question.id)
                                  .map((other) => <option key={other.id} value={other.id}>{other.label}</option>)}
                              </select>
                              <input
                                className={`${inputClassName} flex-1`}
                                value={editForm.show_if_value}
                                onChange={(e) => setEditForm({ ...editForm, show_if_value: e.target.value })}
                                placeholder={editForm.show_if_question_id ? 'e.g. Yes or Other' : 'Shown when a choice matches'}
                                disabled={!editForm.show_if_question_id}
                              />
                            </div>
                            <p className="mt-1.5 text-[11px] leading-4 text-text-tertiary">
                              This question appears only when the question above has the exact value on the right. For multiple-choice questions it appears when that option is selected (e.g. “Other”). Hidden questions are never required and are not stored.
                            </p>
                          </div>

                          {meta.hasOptions && (
                            <div className="sm:col-span-2">
                              <p className="text-xs text-text-secondary">Answer options</p>
                              <div className="mt-2 space-y-2">
                                {editForm.options.map((option, optionIndex) => (
                                  <div key={optionIndex} className="flex items-center gap-2">
                                    <input className={inputClassName} value={option} onChange={(e) => setEditForm({ ...editForm, options: editForm.options.map((o, i) => (i === optionIndex ? e.target.value : o)) })} placeholder={`Option ${optionIndex + 1}`} />
                                    <button type="button" onClick={() => setEditForm({ ...editForm, options: editForm.options.filter((_, i) => i !== optionIndex) })} className="rounded-md border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Remove option ${optionIndex + 1}`}><Trash2 className="h-4 w-4" /></button>
                                  </div>
                                ))}
                                <button type="button" onClick={() => setEditForm({ ...editForm, options: [...editForm.options, ''] })} className={secondaryButtonClassName}><Plus className="h-4 w-4" /> Add option</button>
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end gap-2 sm:col-span-2">
                            <button onClick={() => { setEditingId(null); setEditForm(null) }} className={secondaryButtonClassName}>Cancel</button>
                            <button onClick={() => void saveQuestion()} disabled={savingQuestion || !editForm.label.trim()} className={primaryButtonClassName}>{savingQuestion && <LoaderCircle className="h-4 w-4 animate-spin" />}Save question</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          {/* Add question */}
          {canManage && <Panel title="Add a question" description="Pick a type — the question is created immediately and opens for editing. New types can be added to the registry later without touching this page.">
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
              {QUESTION_TYPES.map((meta) => {
                const Icon = meta.icon
                return (
                  <button key={meta.type} onClick={() => void addQuestion(meta.type)} disabled={busy} className="group rounded-md border border-border bg-surface-raised p-4 text-left transition hover:border-accent disabled:opacity-50">
                    <span className="flex h-9 w-9 items-center justify-center rounded border border-border text-text-tertiary transition group-hover:border-accent group-hover:text-accent"><Icon className="h-4 w-4" /></span>
                    <p className="mt-3 text-sm font-semibold text-fg">{meta.labelEn}</p>
                    <p className="mt-1 text-[11px] leading-4 text-text-tertiary">{meta.descriptionEn}</p>
                  </button>
                )
              })}
            </div>
          </Panel>}
        </>
      )}

      {tab === 'submissions' && (
        <Panel title="Responses" description="Each response stores a frozen snapshot of every question, so edits you make later never rewrite history.">
          {submissionsLoading ? (
            <LoadingState label="Loading responses…" />
          ) : submissions.length === 0 ? (
            <EmptyState icon={Inbox} title="No responses yet" description={live ? 'Share the public link to start collecting responses.' : 'Enable the form to start collecting responses.'} />
          ) : (
            <div className="divide-y divide-border">
              {submissions.map((submission) => {
                const expanded = expandedId === submission.id
                const details = detailsCache[submission.id]
                return (
                  <div
                    key={submission.id}
                    id={`submission-${submission.id}`}
                    className={`px-5 py-4 transition ${expanded ? 'bg-accent/[0.04] border-l-2 border-accent' : 'border-l-2 border-transparent'}`}
                  >
                    <button onClick={() => void toggleSubmission(submission.id)} className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        {expanded ? <ChevronDown className="h-4 w-4 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 text-text-tertiary" />}
                        <div>
                          <p className="text-sm font-semibold text-fg">{submission.respondent_name || submission.respondent_email || 'Anonymous respondent'}</p>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {[submission.respondent_email, submission.company_name].filter(Boolean).join(' · ') || 'No mapped contact fields'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ps-7 sm:ps-0">
                        {submission.status === 'archived' && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">archived</span>}
                        <span className="font-mono-tech text-[10px] text-text-tertiary">v{submission.form_version} · {new Date(submission.submitted_at).toLocaleString()}</span>
                      </div>
                    </button>
                    {expanded && (
                      <div className="mt-4 space-y-4 rounded-md border border-border bg-surface-raised p-4">
                        {detailsLoading && !details ? <LoadingState label="Loading answers…" /> : (
                          <>
                            <dl className="space-y-3">
                              {[...(details?.answers || [])]
                                .sort((a, b) => {
                                  const pos = (row: FormSubmissionAnswer) => {
                                    const snap = row.question_snapshot && typeof row.question_snapshot === 'object' && !Array.isArray(row.question_snapshot) ? row.question_snapshot as Record<string, unknown> : {}
                                    return typeof snap.position === 'number' ? snap.position : 0
                                  }
                                  return pos(a) - pos(b)
                                })
                                .map((answer) => {
                                const snapshot = answer.question_snapshot && typeof answer.question_snapshot === 'object' && !Array.isArray(answer.question_snapshot)
                                  ? answer.question_snapshot as Record<string, unknown>
                                  : {}
                                const attachments = (details?.attachments || []).filter((a) => a.question_id && a.question_id === answer.question_id)
                                return (
                                  <div key={answer.id} className="grid gap-1 sm:grid-cols-[220px_1fr]">
                                    <dt className="text-xs text-text-tertiary">{typeof snapshot.label === 'string' ? snapshot.label : 'Question'}</dt>
                                    <dd className="text-sm text-fg">
                                      {formatAnswer(answer.value)}
                                      {attachments.length > 0 && (
                                        <span className="mt-1 flex flex-wrap gap-2">
                                          {attachments.map((attachment) => (
                                            <button key={attachment.id} onClick={() => void downloadAttachment(attachment)} className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent">
                                              <FileText className="h-3 w-3" /> {attachment.name} <Download className="h-3 w-3" />
                                            </button>
                                          ))}
                                        </span>
                                      )}
                                    </dd>
                                  </div>
                                )
                              })}
                            </dl>
                            {can('submission.edit') && (
                              <div className="flex justify-end border-t border-border pt-3">
                                {submission.status === 'archived' ? (
                                  <button onClick={() => void setSubmissionStatus(submission, 'submitted')} className={secondaryButtonClassName}><ArchiveRestore className="h-4 w-4" /> Restore</button>
                                ) : (
                                  <button onClick={() => void setSubmissionStatus(submission, 'archived')} className={secondaryButtonClassName}><Archive className="h-4 w-4" /> Archive response</button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      )}

      {/* Live preview */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Respondent preview" description="Exactly what visitors see at the public link. Answers here are not submitted.">
        <div className="mb-4 flex justify-end">
          <button onClick={() => setPreviewLang(previewLang === 'ar' ? 'en' : 'ar')} className={secondaryButtonClassName}>{previewLang === 'ar' ? 'English' : 'العربية'}</button>
        </div>
        <div dir={previewLang === 'ar' ? 'rtl' : 'ltr'}>
          <DynamicFormRenderer
            questions={questions}
            values={previewValues}
            onAnswer={(questionId, value) => setPreviewValues((current) => ({ ...current, [questionId]: value }))}
            lang={previewLang}
          />
        </div>
      </Modal>
    </Page>
  )
}
