'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileWarning, Globe, LoaderCircle, Send, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  getFormQuestions,
  getFormTemplateBySlug,
  submitDynamicForm,
  uploadFormFile,
} from '@/lib/supabase/database'
import type { FormQuestion, FormTemplate } from '@/lib/supabase/types'
import { DynamicFormRenderer } from '@/components/forms/dynamic-form-renderer'
import { isAnswerEmpty, ratingMax, type AnswerMap, type AnswerValue, type UploadedFileMeta } from '@/lib/forms/question-types'
import { InlineAlert, primaryButtonClassName } from '@/components/ui/page'

// ── Public dynamic form page ─────────────────────────────────────────────────
// Renders any published form straight from the database. An admin can create a
// brand-new form in the builder and this page serves it immediately — no code
// change, no redeploy.

type Lang = 'ar' | 'en'
const HEADING = 'AGENCY OS / FORM'

const t = (lang: Lang) => ({
  requiredHint: lang === 'ar' ? 'الحقول بعلامة * إلزامية.' : 'Fields marked * are required.',
  submit: lang === 'ar' ? 'إرسال' : 'Submit',
  submitting: lang === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…',
  fillRequired: lang === 'ar' ? 'يرجى الإجابة على جميع الأسئلة الإلزامية.' : 'Please answer all required questions.',
  requiredQuestion: lang === 'ar' ? 'هذا السؤال مطلوب' : 'This question is required',
  submittedTitle: lang === 'ar' ? 'تم إرسال ردّك بنجاح!' : 'Your response was submitted!',
  submittedDesc: lang === 'ar' ? 'شكراً لك. تم استلام إجاباتك وسيتواصل معك الفريق قريباً.' : 'Thank you. Your answers have been received and our team will contact you soon.',
  another: lang === 'ar' ? 'إرسال رد آخر' : 'Submit another response',
  preparing: lang === 'ar' ? 'جارٍ تجهيز النموذج…' : 'Preparing the form…',
  unavailableTitle: lang === 'ar' ? 'هذا النموذج غير متاح' : 'This form is unavailable',
  unavailableDesc: lang === 'ar' ? 'الرابط غير صحيح أو النموذج لم يعد يستقبل الردود.' : 'The link is incorrect or the form is no longer accepting responses.',
  fileNeedsSession: lang === 'ar' ? 'رفع الملفات غير متاح حالياً. فعّل Anonymous sign-ins في Supabase أو أجب بدون ملفات.' : 'File upload is unavailable right now. Enable Anonymous sign-ins in Supabase or answer without files.',
  badNumber: lang === 'ar' ? 'أدخل رقماً صحيحاً' : 'Enter a valid number',
})

export default function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user, configured, signInAnonymously, loading: authLoading } = useAuth()
  const [lang, setLang] = useState<Lang>('ar')
  const i18n = useMemo(() => t(lang), [lang])

  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [questions, setQuestions] = useState<FormQuestion[]>([])
  const [values, setValues] = useState<AnswerMap>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [uploadingQuestionId, setUploadingQuestionId] = useState<string | null>(null)

  // Anonymous session (same pattern as /intake): gives the respondent ownership
  // of their submission and the ability to upload files. The form still works
  // read-and-submit without it, only file uploads require the session.
  useEffect(() => {
    if (!configured || authLoading || user) return
    void signInAnonymously()
  }, [configured, authLoading, user, signInAnonymously])

  const load = useCallback(async () => {
    setLoading(true)
    const templateResult = await getFormTemplateBySlug(slug)
    if (templateResult.error || !templateResult.data) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    setTemplate(templateResult.data)
    const questionsResult = await getFormQuestions(templateResult.data.id)
    if (questionsResult.error) {
      setError(questionsResult.error)
      setUnavailable(true)
    } else {
      setQuestions(questionsResult.data)
    }
    setLoading(false)
  }, [slug])

  useEffect(() => { void load() }, [load])

  const answer = (questionId: string, value: AnswerValue) => {
    setValues((current) => ({ ...current, [questionId]: value }))
    setErrors((current) => {
      if (!current[questionId]) return current
      const next = { ...current }
      delete next[questionId]
      return next
    })
  }

  const pickFile = async (question: FormQuestion, file: File) => {
    if (!user) {
      setError(i18n.fileNeedsSession)
      return
    }
    setError('')
    setUploadingQuestionId(question.id)
    const result = await uploadFormFile(user.id, file)
    setUploadingQuestionId(null)
    if (result.error || !result.data) {
      setError(result.error || i18n.fileNeedsSession)
      return
    }
    const current = values[question.id]
    const files = Array.isArray(current) ? (current as UploadedFileMeta[]) : []
    answer(question.id, [...files, result.data])
  }

  const removeFile = (question: FormQuestion, index: number) => {
    const current = values[question.id]
    const files = Array.isArray(current) ? (current as UploadedFileMeta[]) : []
    answer(question.id, files.filter((_, itemIndex) => itemIndex !== index))
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    for (const question of questions) {
      const value = values[question.id]
      if (question.required && isAnswerEmpty(value)) nextErrors[question.id] = i18n.requiredQuestion
      else if (question.question_type === 'number' && !isAnswerEmpty(value) && typeof value === 'string' && Number.isNaN(Number(value))) nextErrors[question.id] = i18n.badNumber
      else if (question.question_type === 'rating' && !isAnswerEmpty(value)) {
        const score = Number(value)
        if (!Number.isInteger(score) || score < 1 || score > ratingMax(question.config)) nextErrors[question.id] = i18n.requiredQuestion
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = async () => {
    if (!template) return
    setError('')
    if (!validate()) {
      setError(i18n.fillRequired)
      return
    }
    setSubmitting(true)
    const result = await submitDynamicForm(template.id, values)
    setSubmitting(false)
    if (result.error || !result.data) {
      setError(result.error || 'Submission failed.')
      return
    }
    setDone(true)
  }

  const reset = () => {
    setValues({})
    setErrors({})
    setError('')
    setDone(false)
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-bg text-sm text-text-secondary">
        <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
        {i18n.preparing}
      </main>
    )
  }

  // ── Unavailable ──────────────────────────────────────────────────────────
  if (unavailable || !template) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-5">
        <div className="w-full max-w-md rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <FileWarning className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-fg">{i18n.unavailableTitle}</h1>
          <p className="mt-3 text-sm text-text-secondary">{i18n.unavailableDesc}</p>
        </div>
      </main>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-5">
        <div className="w-full max-w-lg rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <CheckCircle2 className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-fg">{i18n.submittedTitle}</h1>
          <p className="mt-3 text-sm text-text-secondary">{i18n.submittedDesc}</p>
          <button onClick={reset} className={`${primaryButtonClassName} mt-6`}>{i18n.another}</button>
        </div>
      </main>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen bg-bg">
      <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="font-mono-tech text-[10px] text-text-tertiary">{HEADING}</span>
          </div>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-line-light hover:text-fg">
            <Globe className="h-3.5 w-3.5" /> {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="mb-8">
          <h1 className="font-display text-4xl leading-none tracking-tight text-fg sm:text-5xl">{template.title}</h1>
          {template.description && <p className="mt-3 text-sm leading-6 text-text-secondary">{template.description}</p>}
        </div>

        {error && <div className="mb-6"><InlineAlert>{error}</InlineAlert></div>}

        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border p-5">
            <p className="text-xs text-text-tertiary">{i18n.requiredHint}</p>
          </div>
          <div className="p-5">
            <DynamicFormRenderer
              questions={questions}
              values={values}
              onAnswer={answer}
              onFileSelect={(question, file) => void pickFile(question, file)}
              onFileRemove={removeFile}
              uploadingQuestionId={uploadingQuestionId}
              lang={lang}
              errors={errors}
            />
          </div>
          <div className="flex justify-end border-t border-border p-5">
            <button onClick={() => void submit()} disabled={submitting} className={primaryButtonClassName}>
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? i18n.submitting : i18n.submit}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
