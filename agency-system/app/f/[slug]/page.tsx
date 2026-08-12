'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, FileWarning, Globe, LoaderCircle, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  getFormQuestions,
  getFormTemplateBySlug,
  uploadFormFile,
} from '@/lib/supabase/database'
import type { FormQuestion, FormTemplate } from '@/lib/supabase/types'
import { DynamicFormRenderer } from '@/components/forms/dynamic-form-renderer'
import { TurnstileWidget } from '@/components/forms/turnstile-widget'
import { isAnswerEmpty, isQuestionVisible, ratingMax, type AnswerMap, type AnswerValue, type UploadedFileMeta } from '@/lib/forms/question-types'
import { validateFile } from '@/lib/storage-config'
import { InlineAlert, primaryButtonClassName } from '@/components/ui/page'

// ── Public dynamic form page ─────────────────────────────────────────────────
// Renders any published form straight from the database. An admin can create a
// brand-new form in the builder and this page serves it immediately — no code
// change, no redeploy.
//
// Security hardening (Session 05):
//   • Honeypot field (hidden from humans, traps bots)
//   • Cloudflare Turnstile integration (optional, when configured)
//   • Client-side 30-second cooldown after each successful submit
//   • Text-length pre-validation (10 000 chars per answer)
//   • Submission routed through POST /api/forms/submit which adds IP rate
//     limiting, Turnstile server-side verification, and proxy to the hardened
//     submit_dynamic_form RPC
//   • Duplicate submission protection (same email → same form within 5 min)

type Lang = 'ar' | 'en'
const HEADING = 'AGENCY OS / FORM'

// Honeypot field name — looks real to bots but is hidden via CSS.
// Bots that fill every field will populate this, causing silent rejection.
const HONEYPOT_FIELD_NAME = 'company_website_url'
const HONEYPOT_FIELD_NAME_AR = 'url_website_company'

// Client-side cooldown after a successful submission (milliseconds).
const SUBMIT_COOLDOWN_MS = 30_000

// Maximum characters per text answer (client-side pre-check).
const MAX_TEXT_LENGTH = 10_000

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
  cooldown: lang === 'ar'
    ? 'يمكنك إرسال رد آخر بعد {seconds} ثانية.'
    : 'You can submit another response in {seconds} seconds.',
  answerTooLong: lang === 'ar'
    ? 'أحد إجاباتك طويلة جداً. الحد الأقصى هو 10,000 حرف.'
    : 'One of your answers is too long. Maximum is 10,000 characters.',
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

  // Session 05 — security state
  const [honeypot, setHoneypot] = useState('') // must stay empty
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitTimeRef = useRef<number>(0)

  // Anonymous session: gives the respondent ownership
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

  // Cooldown timer — counts down from SUBMIT_COOLDOWN_MS to 0.
  useEffect(() => {
    if (cooldownRemaining <= 0) return
    cooldownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - submitTimeRef.current
      const remaining = Math.max(0, Math.ceil((SUBMIT_COOLDOWN_MS - elapsed) / 1000))
      setCooldownRemaining(remaining)
      if (remaining <= 0 && cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
    }, 1000)
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
    }
  }, [cooldownRemaining > 0]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const validation = validateFile(file, 'form-files', lang)
    if (!validation.valid) {
      setError(lang === 'ar' ? (validation.errorAr || validation.error || '') : (validation.error || ''))
      return
    }
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
      // Skip questions hidden by an unmet show-if rule — they aren't required
      // and won't be stored, mirroring the server-side submit logic.
      if (!isQuestionVisible(question, values)) continue
      const value = values[question.id]
      if (question.required && isAnswerEmpty(value)) nextErrors[question.id] = i18n.requiredQuestion
      else if (question.question_type === 'number' && !isAnswerEmpty(value) && typeof value === 'string' && Number.isNaN(Number(value))) nextErrors[question.id] = i18n.badNumber
      else if (question.question_type === 'rating' && !isAnswerEmpty(value)) {
        const score = Number(value)
        if (!Number.isInteger(score) || score < 1 || score > ratingMax(question.config)) nextErrors[question.id] = i18n.requiredQuestion
      }
      // Session 05: client-side text length pre-check
      if (!isAnswerEmpty(value) && typeof value === 'string' && value.length > MAX_TEXT_LENGTH) {
        nextErrors[question.id] = i18n.answerTooLong
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = async () => {
    if (!template) return
    setError('')

    // ── Session 05: Honeypot check ───────────────────────────────────────
    if (honeypot.trim() !== '') {
      // Bot detected — silently pretend success.
      setDone(true)
      return
    }

    // ── Session 05: Cooldown check ───────────────────────────────────────
    if (cooldownRemaining > 0) {
      setError(i18n.cooldown.replace('{seconds}', String(cooldownRemaining)))
      return
    }

    // ── Standard validation ──────────────────────────────────────────────
    if (!validate()) {
      setError(i18n.fillRequired)
      return
    }

    setSubmitting(true)

    try {
      // Get the current access token for the API route.
      const { supabase } = await import('@/lib/supabase/client')
      let accessToken = ''
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession()
        accessToken = sessionData.session?.access_token || ''
      }

      // ── Session 05: Submit through the hardened API route ──────────────
      const response = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: template.id,
          answers: values,
          turnstileToken,
          accessToken,
        }),
      })

      const result = (await response.json()) as { data?: unknown; error?: string }

      if (!response.ok || result.error) {
        setError(result.error || 'Submission failed.')
        setSubmitting(false)
        return
      }

      // Success — start cooldown.
      submitTimeRef.current = Date.now()
      setCooldownRemaining(Math.ceil(SUBMIT_COOLDOWN_MS / 1000))
      setDone(true)
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setValues({})
    setErrors({})
    setError('')
    setDone(false)
    setTurnstileToken(null)
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
          {cooldownRemaining > 0 ? (
            <p className="mt-4 text-xs text-text-tertiary">
              {i18n.cooldown.replace('{seconds}', String(cooldownRemaining))}
            </p>
          ) : (
            <button onClick={reset} className={`${primaryButtonClassName} mt-6`}>{i18n.another}</button>
          )}
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
            {/* ── Session 05: Honeypot field ────────────────────────────────
                Hidden from human view via CSS. Bots that auto-fill every
                <input> will populate this, allowing us to silently reject
                the submission without tipping off the bot operator. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-9999px',
                width: '1px',
                height: '1px',
                overflow: 'hidden',
                opacity: 0,
                pointerEvents: 'none',
              }}
              tabIndex={-1}
            >
              <label>
                {/* Label text looks plausible to automated scrapers */}
                {lang === 'ar' ? 'موقع الشركة' : 'Company website'}
                <input
                  type="text"
                  name={lang === 'ar' ? HONEYPOT_FIELD_NAME_AR : HONEYPOT_FIELD_NAME}
                  autoComplete="off"
                  tabIndex={-1}
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  aria-label="Leave this field empty"
                />
              </label>
            </div>

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
          <div className="flex flex-col items-end gap-3 border-t border-border p-5">
            {/* ── Session 05: Turnstile widget (invisible when configured) ─ */}
            <TurnstileWidget onVerify={setTurnstileToken} className="mb-1" />

            <div className="flex items-center gap-3">
              {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                  <ShieldCheck className="h-3 w-3" />
                  Protected
                </span>
              )}
              <button
                onClick={() => void submit()}
                disabled={submitting || cooldownRemaining > 0}
                className={primaryButtonClassName}
              >
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? i18n.submitting : i18n.submit}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
