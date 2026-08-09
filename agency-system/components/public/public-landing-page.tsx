'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe,
  Layers3,
  LoaderCircle,
  LogIn,
  Menu,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  getFormQuestions,
  getPublicFormTemplates,
  submitDynamicForm,
  uploadFormFile,
} from '@/lib/supabase/database'
import type { FormQuestion, FormTemplateWithCounts } from '@/lib/supabase/types'
import { DynamicFormRenderer } from '@/components/forms/dynamic-form-renderer'
import {
  isAnswerEmpty,
  isQuestionVisible,
  ratingMax,
  type AnswerMap,
  type AnswerValue,
  type UploadedFileMeta,
} from '@/lib/forms/question-types'
import { InlineAlert, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type Lang = 'ar' | 'en'

const t = (lang: Lang) => ({
  logoTitle: 'AGENCY OS',
  logoSubtitle: 'CREATIVE STUDIO',
  navNewProject: lang === 'ar' ? 'أحتاج مشروعاً جديداً' : 'I need a new project',
  navPortfolio: lang === 'ar' ? 'معرض الأعمال' : 'View our portfolio',
  navLogin: lang === 'ar' ? 'تسجيل الدخول' : 'Login',
  navDashboard: lang === 'ar' ? 'لوحة التحكم' : 'Go to Dashboard',
  
  heroTag: lang === 'ar' ? 'المنصة العامة لطلبات المشاريع' : 'PUBLIC PROJECT INTAKE',
  heroTitle1: lang === 'ar' ? 'ابدأ مشروعك' : 'START YOUR',
  heroTitleAccent: lang === 'ar' ? 'الجديد' : 'NEXT PROJECT',
  heroTitle2: lang === 'ar' ? 'بسهولة.' : 'WITH EASE.',
  heroSubtitle: lang === 'ar'
    ? 'اختر الخدمة المناسبة، املأ نموذج الطلب، وسيتواصل معك فريقنا فوراً — بدون الحاجة لإنشاء حساب أو تسجيل دخول.'
    : 'Select the service you need, complete the quick request form, and our team will get started right away — no login required.',
  
  optionsHeading: lang === 'ar' ? 'ماذا تريد أن تفعل اليوم؟' : 'What would you like to do?',
  btnNewProject: lang === 'ar' ? 'أحتاج مشروعاً جديداً' : 'I need a new project',
  btnPortfolio: lang === 'ar' ? 'تصفح أعمالنا' : 'View our portfolio',
  btnLogin: lang === 'ar' ? 'تسجيل الدخول للنظام' : 'Login to Workspace',
  
  servicesSectionTag: lang === 'ar' ? '01 / الخدمات وال النماذج المتاحة' : '01 / AVAILABLE SERVICES & FORMS',
  servicesHeading: lang === 'ar' ? 'الخدمات المتاحة للطلب' : 'OUR AVAILABLE SERVICES',
  servicesDesc: lang === 'ar'
    ? 'النماذج أدناه مُدارة ديناميكياً من قِبل إدارة النظام. اختر الخدمة للبدء في ملء النموذج فوراً.'
    : 'The forms below are managed dynamically by our Admin Team. Select a service to open its dynamic form.',
  
  noFormsTitle: lang === 'ar' ? 'لا توجد خدمات متاحة حالياً' : 'No active services available right now',
  noFormsDesc: lang === 'ar'
    ? 'يقوم مسؤول النظام حالياً بإنشاء وتحديث نماذج الخدمات. يرجى العودة لاحقاً أو التواصل معنا.'
    : 'The Admin is preparing or updating service forms. Please check back shortly.',
  
  openForm: lang === 'ar' ? 'بدء طلب الخدمة' : 'Start Project Request',
  backToServices: lang === 'ar' ? 'الرجوع لجميع الخدمات' : 'Back to all services',
  questionsCount: (c: number) => lang === 'ar' ? `${c} أسئلة` : `${c} question${c === 1 ? '' : 's'}`,
  noAccountRequired: lang === 'ar' ? 'بدون حساب' : 'No account required',
  
  formRequiredHint: lang === 'ar' ? 'الحقول بعلامة * إلزامية.' : 'Fields marked * are required.',
  submit: lang === 'ar' ? 'إرسال الطلب' : 'Submit Request',
  submitting: lang === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…',
  fillRequired: lang === 'ar' ? 'يرجى الإجابة على جميع الأسئلة الإلزامية.' : 'Please answer all required questions.',
  requiredQuestion: lang === 'ar' ? 'هذا السؤال مطلوب' : 'This question is required',
  badNumber: lang === 'ar' ? 'أدخل رقماً صحيحاً' : 'Enter a valid number',
  fileNeedsSession: lang === 'ar' ? 'رفع الملفات غير متاح حالياً.' : 'File upload is currently unavailable.',
  
  submittedTitle: lang === 'ar' ? 'تم إرسال طلبك بنجاح!' : 'Your project request was submitted!',
  submittedDesc: lang === 'ar'
    ? 'شكراً لك. تم استلام بيانات الطلب وسيقوم فريقنا بمراجعتها والتواصل معك في أقرب وقت.'
    : 'Thank you. Your request details have been received and our team will get in touch shortly.',
  submitAnother: lang === 'ar' ? 'إرسال طلب جديد' : 'Submit another request',
  
  footerText: 'AGENCY OS — Dynamic Agency Operations & Public Intake Platform',
})

export function PublicLandingPage() {
  const { user, configured, signInAnonymously, loading: authLoading, profile, isClient } = useAuth()
  const [lang, setLang] = useState<Lang>('ar')
  const i18n = useMemo(() => t(lang), [lang])
  
  const [forms, setForms] = useState<FormTemplateWithCounts[]>([])
  const [loadingForms, setLoadingForms] = useState(true)
  const [formsError, setFormsError] = useState('')
  
  // Selected form state
  const [activeForm, setActiveForm] = useState<FormTemplateWithCounts | null>(null)
  const [questions, setQuestions] = useState<FormQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [values, setValues] = useState<AnswerMap>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [uploadingQuestionId, setUploadingQuestionId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const servicesRef = useRef<HTMLDivElement>(null)

  // Ensure anonymous session for public submitters (allows file uploads)
  useEffect(() => {
    if (!configured || authLoading || user) return
    void signInAnonymously()
  }, [configured, authLoading, user, signInAnonymously])

  // Load published forms dynamically from database
  const loadPublishedForms = useCallback(async () => {
    setLoadingForms(true)
    const result = await getPublicFormTemplates()
    if (result.error) {
      setFormsError(result.error)
    } else {
      setForms(result.data)
    }
    setLoadingForms(false)
  }, [])

  useEffect(() => {
    void loadPublishedForms()
  }, [loadPublishedForms])

  // Scroll to services section
  const scrollToServices = () => {
    servicesRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Open a specific form
  const selectForm = async (form: FormTemplateWithCounts) => {
    setActiveForm(form)
    setValues({})
    setErrors({})
    setSubmitError('')
    setSubmitted(false)
    setQuestionsLoading(true)
    
    const result = await getFormQuestions(form.id)
    if (result.error) {
      setSubmitError(result.error)
    } else {
      setQuestions(result.data)
    }
    setQuestionsLoading(false)

    // Scroll smoothly to form container
    setTimeout(() => {
      servicesRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  // Close form view back to services list
  const closeForm = () => {
    setActiveForm(null)
    setQuestions([])
    setValues({})
    setErrors({})
    setSubmitError('')
    setSubmitted(false)
  }

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
      setSubmitError(i18n.fileNeedsSession)
      return
    }
    setSubmitError('')
    setUploadingQuestionId(question.id)
    const result = await uploadFormFile(user.id, file)
    setUploadingQuestionId(null)
    if (result.error || !result.data) {
      setSubmitError(result.error || i18n.fileNeedsSession)
      return
    }
    const current = values[question.id]
    const filesList = Array.isArray(current) ? (current as UploadedFileMeta[]) : []
    answer(question.id, [...filesList, result.data])
  }

  const removeFile = (question: FormQuestion, index: number) => {
    const current = values[question.id]
    const filesList = Array.isArray(current) ? (current as UploadedFileMeta[]) : []
    answer(question.id, filesList.filter((_, itemIndex) => itemIndex !== index))
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    for (const question of questions) {
      if (!isQuestionVisible(question, values)) continue
      const value = values[question.id]
      if (question.required && isAnswerEmpty(value)) {
        nextErrors[question.id] = i18n.requiredQuestion
      } else if (question.question_type === 'number' && !isAnswerEmpty(value) && typeof value === 'string' && Number.isNaN(Number(value))) {
        nextErrors[question.id] = i18n.badNumber
      } else if (question.question_type === 'rating' && !isAnswerEmpty(value)) {
        const score = Number(value)
        if (!Number.isInteger(score) || score < 1 || score > ratingMax(question.config)) {
          nextErrors[question.id] = i18n.requiredQuestion
        }
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = async () => {
    if (!activeForm) return
    setSubmitError('')
    if (!validate()) {
      setSubmitError(i18n.fillRequired)
      return
    }
    setSubmitting(true)
    const result = await submitDynamicForm(activeForm.id, values)
    setSubmitting(false)
    if (result.error || !result.data) {
      setSubmitError(result.error || 'Submission failed.')
      return
    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header / Nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080808]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-white/20 bg-white/[0.05] text-accent transition group-hover:border-accent">
              <Layers3 className="h-4 w-4" />
            </span>
            <div>
              <span className="block text-sm font-bold tracking-[0.2em]">{i18n.logoTitle}</span>
              <span className="font-mono-tech text-[8px] text-white/40">{i18n.logoSubtitle}</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
            <button
              onClick={() => { closeForm(); scrollToServices() }}
              className="text-xs font-medium text-white/70 transition hover:text-white"
            >
              {i18n.navNewProject}
            </button>
            <Link href="/portfolio" className="text-xs font-medium text-white/70 transition hover:text-white">
              {i18n.navPortfolio}
            </Link>
            
            {user && !isClient && (
              <Link href="/" className="text-xs font-medium text-accent transition hover:underline">
                {i18n.navDashboard}
              </Link>
            )}

            {!user && (
              <Link
                href="/auth"
                className="inline-flex items-center gap-1.5 border border-white/20 px-3.5 py-1.5 text-xs font-medium text-white transition hover:border-accent hover:bg-accent hover:text-accent-foreground"
              >
                <LogIn className="h-3.5 w-3.5" />
                {i18n.navLogin}
              </Link>
            )}

            {/* Language Switcher */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-xs text-white/70"
            >
              <Globe className="h-3 w-3" />
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
            <button
              type="button"
              className="rounded border border-white/15 p-2 text-white"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {menuOpen && (
          <nav className="border-t border-white/10 bg-[#111] p-4 md:hidden space-y-3">
            <button
              onClick={() => { setMenuOpen(false); closeForm(); scrollToServices() }}
              className="block w-full text-start py-2 text-sm text-white/80"
            >
              {i18n.navNewProject}
            </button>
            <Link
              href="/portfolio"
              onClick={() => setMenuOpen(false)}
              className="block py-2 text-sm text-white/80"
            >
              {i18n.navPortfolio}
            </Link>
            {!user && (
              <Link
                href="/auth"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground w-full justify-center"
              >
                <LogIn className="h-4 w-4" />
                {i18n.navLogin}
              </Link>
            )}
          </nav>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_80%_15%,rgba(185,40,45,0.22),transparent_40%),linear-gradient(135deg,#080808_0%,#0f0f10_60%,#180a0c_100%)] px-5 py-20 sm:px-8 lg:px-10 lg:py-28 border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        
        <div className="relative mx-auto max-w-7xl">
          <p className="mb-4 flex items-center gap-2 font-mono-tech text-xs tracking-[0.2em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            {i18n.heroTag}
          </p>

          <h1 className="font-display text-5xl leading-none tracking-tight sm:text-7xl lg:text-8xl">
            {i18n.heroTitle1} <span className="text-accent">{i18n.heroTitleAccent}</span><br />
            {i18n.heroTitle2}
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
            {i18n.heroSubtitle}
          </p>

          {/* Quick Option Cards / Action Buttons */}
          <div className="mt-10 pt-6 border-t border-white/10">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
              {i18n.optionsHeading}
            </p>
            <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
              {/* Option 1: I need a new project */}
              <button
                onClick={() => { closeForm(); scrollToServices() }}
                className="group flex flex-col items-start justify-between rounded-lg border border-accent bg-accent/10 p-5 text-start transition hover:bg-accent/20 hover:border-accent"
              >
                <div>
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-accent text-accent-foreground font-bold">
                    1
                  </span>
                  <h3 className="mt-4 text-base font-bold text-white group-hover:text-accent">
                    {i18n.btnNewProject}
                  </h3>
                  <p className="mt-1 text-xs text-white/50">
                    {lang === 'ar' ? 'اختر الخدمة واملأ النموذج فوراً' : 'Browse active intake forms'}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-accent">
                  <span>{lang === 'ar' ? 'عرض الخدمات' : 'View services'}</span>
                  <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
                </div>
              </button>

              {/* Option 2: View our portfolio */}
              <Link
                href="/portfolio"
                className="group flex flex-col items-start justify-between rounded-lg border border-white/15 bg-white/[0.02] p-5 text-start transition hover:border-white/40 hover:bg-white/[0.05]"
              >
                <div>
                  <span className="flex h-8 w-8 items-center justify-center rounded border border-white/20 bg-white/5 text-white font-bold">
                    2
                  </span>
                  <h3 className="mt-4 text-base font-bold text-white group-hover:text-accent">
                    {i18n.btnPortfolio}
                  </h3>
                  <p className="mt-1 text-xs text-white/50">
                    {lang === 'ar' ? 'استعرض أبرز أعمالنا السابقة' : 'Explore selected works'}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-white/70 group-hover:text-white">
                  <span>{lang === 'ar' ? 'فتح المعرض' : 'Open portfolio'}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>

              {/* Option 3: Login */}
              <Link
                href="/auth"
                className="group flex flex-col items-start justify-between rounded-lg border border-white/15 bg-white/[0.02] p-5 text-start transition hover:border-white/40 hover:bg-white/[0.05]"
              >
                <div>
                  <span className="flex h-8 w-8 items-center justify-center rounded border border-white/20 bg-white/5 text-white font-bold">
                    3
                  </span>
                  <h3 className="mt-4 text-base font-bold text-white group-hover:text-accent">
                    {i18n.btnLogin}
                  </h3>
                  <p className="mt-1 text-xs text-white/50">
                    {lang === 'ar' ? 'تسجيل دخول العملاء والفريق' : 'Client & Staff login'}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-white/70 group-hover:text-white">
                  <span>{lang === 'ar' ? 'الدخول للنظام' : 'Sign in'}</span>
                  <LogIn className="h-3.5 w-3.5" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services & Dynamic Forms Section ("I need a new project") */}
      <section ref={servicesRef} className="px-5 py-16 sm:px-8 lg:px-10 lg:py-24 bg-[#0a0a0b]">
        <div className="mx-auto max-w-7xl">
          {/* Header for Services section */}
          <div className="mb-10 border-b border-white/10 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="font-mono-tech text-xs text-accent">{i18n.servicesSectionTag}</p>
              <h2 className="mt-2 font-display text-4xl sm:text-6xl text-white">
                {activeForm ? activeForm.title : i18n.servicesHeading}
              </h2>
            </div>
            {activeForm ? (
              <button
                onClick={closeForm}
                className={`${secondaryButtonClassName} bg-white/5 text-white border-white/20 hover:bg-white/10`}
              >
                <ArrowLeft className="h-4 w-4" /> {i18n.backToServices}
              </button>
            ) : (
              <p className="max-w-md text-xs text-white/50 leading-relaxed">
                {i18n.servicesDesc}
              </p>
            )}
          </div>

          {/* Active Form View */}
          {activeForm ? (
            <div className="rounded-xl border border-white/15 bg-[#121214] p-6 sm:p-8 shadow-2xl">
              {activeForm.description && (
                <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70">
                  {activeForm.description}
                </div>
              )}

              {submitError && (
                <div className="mb-6">
                  <InlineAlert>{submitError}</InlineAlert>
                </div>
              )}

              {submitted ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{i18n.submittedTitle}</h3>
                  <p className="mt-3 text-sm text-white/60 max-w-md mx-auto">{i18n.submittedDesc}</p>
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                    <button
                      onClick={() => {
                        setSubmitted(false)
                        setValues({})
                        setErrors({})
                      }}
                      className={primaryButtonClassName}
                    >
                      {i18n.submitAnother}
                    </button>
                    <button
                      onClick={closeForm}
                      className={secondaryButtonClassName}
                    >
                      {i18n.backToServices}
                    </button>
                  </div>
                </div>
              ) : questionsLoading ? (
                <div className="flex min-h-[300px] items-center justify-center gap-3 text-sm text-white/50">
                  <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
                  {lang === 'ar' ? 'جارٍ تحميل أسئلة النموذج…' : 'Loading form questions…'}
                </div>
              ) : (
                <div>
                  <div className="mb-6 border-b border-white/10 pb-4">
                    <p className="text-xs text-white/40">{i18n.formRequiredHint}</p>
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

                  <div className="mt-8 flex justify-end border-t border-white/10 pt-6">
                    <button
                      onClick={() => void submit()}
                      disabled={submitting}
                      className={`${primaryButtonClassName} text-sm px-6 py-3`}
                    >
                      {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {submitting ? i18n.submitting : i18n.submit}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Services Grid (All Published Forms from Database) */
            <div>
              {loadingForms ? (
                <div className="flex min-h-[200px] items-center justify-center gap-3 text-sm text-white/50">
                  <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
                  {lang === 'ar' ? 'جارٍ تحميل الخدمات والنماذج…' : 'Loading active service forms…'}
                </div>
              ) : formsError ? (
                <InlineAlert>{formsError}</InlineAlert>
              ) : forms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center">
                  <ClipboardList className="mx-auto h-12 w-12 text-white/30" />
                  <h3 className="mt-4 text-lg font-bold text-white">{i18n.noFormsTitle}</h3>
                  <p className="mt-2 text-xs text-white/50 max-w-md mx-auto">{i18n.noFormsDesc}</p>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {forms.map((form) => {
                    const qCount = form.form_questions?.[0]?.count ?? 0
                    return (
                      <div
                        key={form.id}
                        className="group flex flex-col justify-between rounded-xl border border-white/10 bg-[#121214] p-6 transition duration-200 hover:border-accent hover:bg-[#161619] hover:shadow-xl"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex h-10 w-10 items-center justify-center rounded bg-accent/10 border border-accent/30 text-accent group-hover:bg-accent group-hover:text-accent-foreground transition">
                              <FileText className="h-5 w-5" />
                            </span>
                            <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-mono-tech text-white/50 border border-white/10">
                              {i18n.questionsCount(qCount)}
                            </span>
                          </div>

                          <h3 className="mt-5 text-xl font-bold text-white group-hover:text-accent transition">
                            {form.title}
                          </h3>

                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/60">
                            {form.description || (lang === 'ar' ? 'نموذج طلب الخدمة المباشر' : 'Direct service request form')}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                          <span className="text-[10px] text-white/40">
                            {i18n.noAccountRequired}
                          </span>
                          <button
                            onClick={() => void selectForm(form)}
                            className="inline-flex items-center gap-1.5 rounded border border-accent bg-accent/10 px-3.5 py-2 text-xs font-semibold text-accent transition group-hover:bg-accent group-hover:text-accent-foreground"
                          >
                            <span>{i18n.openForm}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#060607] py-8 text-center text-xs text-white/40">
        <div className="mx-auto max-w-7xl px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>{i18n.footerText}</span>
          <div className="flex items-center gap-4">
            <Link href="/portfolio" className="hover:text-white transition">{i18n.navPortfolio}</Link>
            <Link href="/auth" className="hover:text-white transition">{i18n.navLogin}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
