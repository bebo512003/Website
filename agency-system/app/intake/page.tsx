'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  FileText,
  Globe,
  LoaderCircle,
  Save,
  Send,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  createIntakeForm,
  submitIntakeForm,
  updateIntakeForm,
  uploadIntakeAttachment,
} from '@/lib/supabase/database'
import type { IntakeForm, Json } from '@/lib/supabase/types'
import {
  InlineAlert,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '@/components/ui/page'

// ── Types ────────────────────────────────────────────────────────
type Service = 'logo_design' | 'visual_identity' | 'company_profile'
type Lang = 'ar' | 'en'
type Stage = 'services' | 'branching' | 'final'
type Values = Record<string, string>

const HEADING = 'AGENCY OS / MASTER INTAKE'

// ── i18n dictionary ──────────────────────────────────────────────
const t = (lang: Lang) => ({
  // Services stage
  heading: lang === 'ar' ? 'نموذج طلب الخدمة الرئيسي' : 'Master Project Intake Form',
  subtitle: lang === 'ar'
    ? 'املأ بياناتك مرة واحدة — يظهر لك الأسئلة المناسبة حسب الخدمات المختارة.'
    : 'Fill in your details once — we show you the right questions based on your chosen services.',
  stage: (n: number) => lang === 'ar' ? `المرحلة ${n} من 3` : `Stage ${n} of 3`,
  // Labels: stage 1
  companyName: lang === 'ar' ? 'اسم الشركة أو البراند *' : 'Company or Brand Name *',
  businessActivity: lang === 'ar' ? 'نشاط الشركة والخدمات أو المنتجات *' : 'Business Activity / Services or Products *',
  brandStatus: lang === 'ar' ? 'البراند جديد أم قائم؟' : 'Is this a new or existing brand?',
  brandNew: lang === 'ar' ? 'جديد' : 'New',
  brandExisting: lang === 'ar' ? 'قائم' : 'Existing',
  targetAudience: lang === 'ar' ? 'الجمهور المستهدف' : 'Target Audience',
  differentiators: lang === 'ar' ? 'أهم 3 نقاط تميز' : 'Top 3 Differentiators',
  contactName: lang === 'ar' ? 'الاسم الكامل *' : 'Full Name *',
  contactEmail: lang === 'ar' ? 'البريد الإلكتروني' : 'Email',
  phone: lang === 'ar' ? 'رقم الجوال' : 'Phone Number',
  industry: lang === 'ar' ? 'القطاع' : 'Industry / Sector',
  location: lang === 'ar' ? 'الموقع' : 'Location',
  servicesLabel: lang === 'ar' ? 'الخدمات المطلوبة' : 'Services Needed',
  // Logo Design questions
  logoLanguage: lang === 'ar' ? 'لغة الشعار / التاجلاين' : 'Logo Language / Tagline',
  logoStatus: lang === 'ar' ? 'حالة الشعار الحالي' : 'Current Logo Status',
  logoStatusNone: lang === 'ar' ? 'لا يوجد شعار حالياً' : 'No current logo',
  logoStatusHave: lang === 'ar' ? 'يوجد شعار يحتاج تطوير' : 'Have a logo that needs refinement',
  logoStatusRedesign: lang === 'ar' ? 'يوجد شعار وأريد إعادة تصميم بالكامل' : 'Have a logo, want a full redesign',
  logoImpressions: lang === 'ar' ? 'الانطباعات المطلوبة من الشعار' : 'Desired Impressions from the Logo',
  logoForbidden: lang === 'ar' ? 'الألوان والعناصر الممنوعة' : 'Forbidden Colors / Elements',
  logoStyle: lang === 'ar' ? 'أسلوب الشعار المفضل' : 'Preferred Logo Style',
  logoReferences: lang === 'ar' ? 'مراجع وشعارات ملهمة' : 'References / Inspiring Logos',
  logoUsage: lang === 'ar' ? 'أين سيُستخدم الشعار؟' : 'Where Will the Logo Be Used?',
  logoNotes: lang === 'ar' ? 'ملاحظات إضافية حول الشعار' : 'Additional Logo Notes',
  // Visual Identity questions
  identityBase: lang === 'ar' ? 'هل نبني الهوية حول شعار قائم أم شعار + هوية كاملة؟' : 'Build identity around an existing logo, or full Logo + Identity?',
  identityBaseExisting: lang === 'ar' ? 'حول شعار قائم' : 'Around existing logo',
  identityBaseFull: lang === 'ar' ? 'شعار + هوية كاملة' : 'Full Logo + Identity',
  identityScope: lang === 'ar' ? 'ما التطبيقات المطلوبة للهوية؟' : 'What Identity Applications Are Needed?',
  identityPersonality: lang === 'ar' ? 'صِف شخصية العلامة بثلاث كلمات' : 'Describe Brand Personality in 3 Words',
  identityColors: lang === 'ar' ? 'الألوان المفضلة للهوية' : 'Preferred Identity Colors',
  identityTypography: lang === 'ar' ? 'تفضيلات الخطوط' : 'Typography Preferences',
  identityAssets: lang === 'ar' ? 'الأصول والعناصر الحالية' : 'Existing Assets / Elements',
  // Company Profile questions
  profileBusinessType: lang === 'ar' ? 'نوع العمل' : 'Business Type',
  profileGoal: lang === 'ar' ? 'الهدف من البروفايل' : 'Profile Goal / Purpose',
  profileAudience: lang === 'ar' ? 'الجمهور المستهدف للبروفايل' : 'Target Audience for the Profile',
  profileCurrent: lang === 'ar' ? 'هل يوجد بروفايل حالي؟' : 'Do You Have a Current Profile?',
  profileCurrentNone: lang === 'ar' ? 'لا يوجد' : 'None',
  profileCurrentHave: lang === 'ar' ? 'نعم ويحتاج تحديث' : 'Yes, needs updating',
  profileCurrentRedo: lang === 'ar' ? 'نعم وأريد إعادة تصميم' : 'Yes, want a redesign',
  profileLanguage: lang === 'ar' ? 'لغة البروفايل' : 'Profile Language',
  profileSections: lang === 'ar' ? 'الأقسام المطلوبة' : 'Required Sections',
  profileFocus: lang === 'ar' ? 'التركيز الأساسي' : 'Primary Focus',
  profileContentStatus: lang === 'ar' ? 'حالة المحتوى' : 'Content Status',
  profileContentReady: lang === 'ar' ? 'جاهز' : 'Ready',
  profileContentPartial: lang === 'ar' ? 'جزئي' : 'Partial',
  profileContentNone: lang === 'ar' ? 'لا يوجد' : 'None',
  profileFilesStatus: lang === 'ar' ? 'حالة الملفات' : 'Files Status',
  profileFilesReady: lang === 'ar' ? 'جاهزة' : 'Ready',
  profileFilesPartial: lang === 'ar' ? 'جزئية' : 'Partial',
  profileFilesNone: lang === 'ar' ? 'لا توجد' : 'None',
  profileReferences: lang === 'ar' ? 'مراجع وأمثلة للبروفايل' : 'Profile References / Examples',
  // Final stage
  deliveryDate: lang === 'ar' ? 'موعد التسليم المطلوب' : 'Desired Delivery Date',
  additionalNotes: lang === 'ar' ? 'ملاحظات أخرى' : 'Additional Notes',
  uploadLabel: lang === 'ar' ? 'ارفع ملفات ومراجع' : 'Upload Files & References',
  confirmLabel: lang === 'ar' ? 'أؤكد صحة المعلومات المدخلة' : 'I confirm the information above is accurate',
  submitButton: lang === 'ar' ? 'مراجعة وإرسال الطلب' : 'Review & Submit Request',
  submitting: lang === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…',
  back: lang === 'ar' ? 'رجوع' : 'Back',
  next: lang === 'ar' ? 'التالي' : 'Next',
  draftStatus: lang === 'ar' ? 'حالة المسودة' : 'Draft Status',
  saving: lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…',
  saved: lang === 'ar' ? 'تم الحفظ تلقائياً' : 'Auto-saved',
  newDraft: lang === 'ar' ? 'مسودة جديدة' : 'New draft',
  draftHint: lang === 'ar' ? 'تبقى إجاباتك محفوظة كمسودة حتى قبل إرسال الطلب.' : 'Your answers are saved as a draft even before submission.',
  submittedTitle: lang === 'ar' ? 'تم إرسال الطلب بنجاح!' : 'Request Submitted Successfully!',
  submittedDesc: lang === 'ar'
    ? 'تم استلام طلبك وسيتم إنشاء المشاريع المناسبة. سنتواصل معك قريباً.'
    : 'Your request has been received and the appropriate projects will be created. We will contact you soon.',
  newRequest: lang === 'ar' ? 'تقديم طلب جديد' : 'Submit Another Request',
  anonSigningIn: lang === 'ar' ? 'جارٍ إعداد الجلسة…' : 'Preparing your session…',
})

// ── Service definitions ──────────────────────────────────────────
const services: { id: Service; icon: string; labelAr: string; labelEn: string; descriptionAr: string; descriptionEn: string }[] = [
  { id: 'logo_design', icon: '◒', labelAr: 'تصميم شعار', labelEn: 'Logo Design', descriptionAr: 'هوية الشعار، الاتجاه الإبداعي، وملفات الاستخدام.', descriptionEn: 'Logo identity, creative direction, and usage files.' },
  { id: 'visual_identity', icon: '✦', labelAr: 'هوية بصرية', labelEn: 'Visual Identity', descriptionAr: 'نظام بصري متكامل يشمل الألوان والخطوط والتطبيقات.', descriptionEn: 'Complete visual system: colors, typography, and applications.' },
  { id: 'company_profile', icon: '▤', labelAr: 'بروفايل شركة', labelEn: 'Company Profile', descriptionAr: 'محتوى وبنية وتصميم بروفايل الشركة.', descriptionEn: 'Content, structure, and design of company profile.' },
]

// ── Helpers ──────────────────────────────────────────────────────

export default function IntakePage() {
  const { user, configured, signInAnonymously, loading: authLoading } = useAuth()
  const [lang, setLang] = useState<Lang>('ar')
  const i18n = useMemo(() => t(lang), [lang])
  const [stage, setStage] = useState<Stage>('services')
  const [selectedServices, setSelectedServices] = useState<Service[]>([])
  const [values, setValues] = useState<Values>({})
  const [form, setForm] = useState<IntakeForm | null>(null)
  const [attachments, setAttachments] = useState<{ name: string; size: number }[]>([])
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [anonReady, setAnonReady] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Anonymous sign-in on mount ─────────────────────────────────
  useEffect(() => {
    if (!configured) return
    if (authLoading) return
    if (user) { setAnonReady(true); return }

    let cancelled = false
    void (async () => {
      const result = await signInAnonymously()
      if (!cancelled) setAnonReady(!result.error)
    })()
    return () => { cancelled = true }
  }, [configured, authLoading, user, signInAnonymously])

  // ── Service branching helpers ──────────────────────────────────
  const hasLogo = selectedServices.includes('logo_design')
  const hasIdentity = selectedServices.includes('visual_identity')
  const hasProfile = selectedServices.includes('company_profile')

  // ── Payload builder ────────────────────────────────────────────
  const payload = useCallback(() => {
    const serviceType = selectedServices.length === 1 ? selectedServices[0] : null
    return {
      service_type: serviceType,
      service_types: selectedServices,
      contact_name: values.contact_name?.trim() || null,
      contact_email: values.contact_email?.trim() || null,
      company_name: values.company_name?.trim() || null,
      phone: values.phone?.trim() || null,
      data: { ...values, lang } as Json,
    }
  }, [selectedServices, values, lang])

  // ── Auto-save ──────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (selectedServices.length === 0 || !user) return
    setStatus('saving'); setError('')
    const result = form
      ? await updateIntakeForm(form.id, payload())
      : await createIntakeForm(payload())
    if (result.error || !result.data) {
      setStatus('error'); setError(result.error || 'Could not save draft.')
      return
    }
    if (!form) setForm(result.data)
    setStatus('saved')
  }, [form, payload, selectedServices, user])

  useEffect(() => {
    if (selectedServices.length === 0 || !user) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [selectedServices, values, save, user])

  // ── Actions ────────────────────────────────────────────────────
  const toggleService = (s: Service) =>
    setSelectedServices((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const change = (key: string, value: string) => setValues((cur) => ({ ...cur, [key]: value }))

  const upload = async (files: FileList | null) => {
    if (!files?.length || !user) return
    let target = form
    if (!target) {
      const result = await createIntakeForm(payload())
      if (result.error || !result.data) { setError(result.error || 'Save data first.'); return }
      target = result.data; setForm(target)
    }
    setStatus('saving')
    for (const file of Array.from(files)) {
      const result = await uploadIntakeAttachment(target.id, user.id, file)
      if (result.error) { setError(result.error); setStatus('error'); return }
      setAttachments((cur) => [...cur, { name: file.name, size: file.size }])
    }
    setStatus('saved')
  }

  const goBranching = () => {
    if (selectedServices.length === 0) return setError(lang === 'ar' ? 'الرجاء اختيار خدمة واحدة على الأقل.' : 'Please select at least one service.')
    if (!values.company_name?.trim()) return setError(lang === 'ar' ? 'اسم الشركة مطلوب.' : 'Company name is required.')
    setError('')
    setStage('branching')
  }

  const goFinal = () => { setError(''); setStage('final') }

  const submit = async () => {
    if (!confirmed) return setError(lang === 'ar' ? 'يرجى تأكيد صحة المعلومات.' : 'Please confirm the information is accurate.')
    if (!form) { await save(); setError(lang === 'ar' ? 'تم إنشاء المسودة. راجع وأرسل مرة أخرى.' : 'Draft created. Please review and submit again.'); return }
    if (!values.contact_name?.trim() || !values.company_name?.trim())
      return setError(lang === 'ar' ? 'الاسم واسم الشركة مطلوبان.' : 'Name and company are required.')
    setSubmitting(true); setError('')
    const result = await submitIntakeForm(form.id)
    setSubmitting(false)
    if (result.error || !result.data) return setError(result.error || 'Could not submit.')
    setForm(result.data); setStatus('saved')
  }

  // ── Field render helper ────────────────────────────────────────
  const field = (key: string, label: string, type: string, options?: string, required?: boolean) => {
    const submitted = form?.status === 'submitted'
    const cn = type === 'textarea' ? 'sm:col-span-2' : ''
    return (
      <label key={key} className={`text-sm text-text-secondary ${cn}`}>
        {label}{required && <span className="text-accent"> *</span>}
        {type === 'textarea' ? (
          <textarea disabled={submitted} className={`${inputClassName} mt-2 min-h-28`} value={values[key] || ''} onChange={(e) => change(key, e.target.value)} />
        ) : type === 'select' ? (
          <select disabled={submitted} className={`${inputClassName} mt-2`} value={values[key] || ''} onChange={(e) => change(key, e.target.value)}>
            <option value="">{lang === 'ar' ? 'اختر…' : 'Choose…'}</option>
            {options?.split(',').map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input disabled={submitted} type={type} className={`${inputClassName} mt-2`} value={values[key] || ''} onChange={(e) => change(key, e.target.value)} />
        )}
      </label>
    )
  }

  // ── Submitting / loading screen ────────────────────────────────
  if ((!anonReady && !user) || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-bg text-sm text-text-secondary">
        <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
        {i18n.anonSigningIn}
      </main>
    )
  }

  // ── Submitted screen ───────────────────────────────────────────
  const submitted = form?.status === 'submitted'
  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-5">
        <div className="w-full max-w-lg rounded-md border border-border bg-surface p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <CheckCircle2 className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-fg">{i18n.submittedTitle}</h1>
          <p className="mt-3 text-sm text-text-secondary">{i18n.submittedDesc}</p>
          <button onClick={() => { setForm(null); setStage('services'); setSelectedServices([]); setValues({}); setAttachments([]); setConfirmed(false); setStatus('idle'); setError('') }} className={`${primaryButtonClassName} mt-6`}>
            {i18n.newRequest}
          </button>
        </div>
      </main>
    )
  }

  // ── Main form layout ───────────────────────────────────────────
  return (
    <main className="relative min-h-screen bg-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="font-mono-tech text-[10px] text-text-tertiary">{HEADING}</span>
            <span className="text-xs text-text-secondary">{i18n.stage(stage === 'services' ? 1 : stage === 'branching' ? 2 : 3)}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-line-light hover:text-fg">
              <Globe className="h-3.5 w-3.5" /> {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              {status === 'saving' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" /> : status === 'saved' ? <Save className="h-3.5 w-3.5 text-accent" /> : <Save className="h-3.5 w-3.5 text-text-tertiary" />}
              {status === 'saving' ? i18n.saving : status === 'saved' ? i18n.saved : i18n.newDraft}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-border">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: stage === 'services' ? '33%' : stage === 'branching' ? '66%' : '100%' }} />
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 py-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {error && <div className="mb-6"><InlineAlert>{error}</InlineAlert></div>}

        {/* ── Stage 1: Company info + services ─────────────────── */}
        {stage === 'services' && (
          <>
            <div className="mb-8">
              <h1 className="font-display text-4xl leading-none tracking-tight text-fg sm:text-5xl">{i18n.heading}</h1>
              <p className="mt-3 text-sm text-text-secondary">{i18n.subtitle}</p>
            </div>

            <section className="rounded-md border border-border bg-surface">
              <div className="border-b border-border p-5">
                <h2 className="font-semibold text-fg">{lang === 'ar' ? 'معلومات أساسية' : 'Essential Information'}</h2>
                <p className="mt-1 text-xs text-text-tertiary">{lang === 'ar' ? 'الحقول بعلامة * ضرورية.' : 'Fields marked * are required.'}</p>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2">
                {field('company_name', i18n.companyName, 'text', undefined, true)}
                {field('business_activity', i18n.businessActivity, 'textarea', undefined, true)}
                {field('brand_status', i18n.brandStatus, 'select', lang === 'ar' ? 'جديد,قائم' : 'New,Existing')}
                {field('target_audience', i18n.targetAudience, 'textarea')}
                {field('differentiators', i18n.differentiators, 'textarea')}
                {field('contact_name', i18n.contactName, 'text', undefined, true)}
                {field('contact_email', i18n.contactEmail, 'email')}
                {field('phone', i18n.phone, 'tel')}
                {field('industry', i18n.industry, 'text')}
                {field('location', i18n.location, 'text')}
              </div>
            </section>

            {/* Services selection */}
            <section className="mt-5 rounded-md border border-border bg-surface">
              <div className="border-b border-border p-5">
                <h2 className="font-semibold text-fg">{i18n.servicesLabel}</h2>
                <p className="mt-1 text-xs text-text-tertiary">{lang === 'ar' ? 'يمكنك اختيار أكثر من خدمة.' : 'You can select multiple services.'}</p>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-3">
                {services.map((s) => {
                  const active = selectedServices.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleService(s.id)}
                      className={`group rounded-md border p-5 text-left transition ${
                        active
                          ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                          : 'border-border bg-surface-raised hover:border-line-light'
                      }`}
                    >
                      <span className={`flex h-10 w-10 items-center justify-center rounded border text-xl ${active ? 'border-accent text-accent' : 'border-border text-text-tertiary'}`}>
                        {s.icon}
                      </span>
                      <h3 className={`mt-4 text-sm font-semibold ${active ? 'text-accent' : 'text-fg'}`}>
                        {lang === 'ar' ? s.labelAr : s.labelEn}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-text-tertiary">
                        {lang === 'ar' ? s.descriptionAr : s.descriptionEn}
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>

            <div className="mt-6 flex justify-end">
              <button onClick={goBranching} className={primaryButtonClassName}>
                {i18n.next} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {/* ── Stage 2: Branching questions ──────────────────────── */}
        {stage === 'branching' && (
          <>
            <div className="mb-8">
              <h1 className="font-display text-4xl leading-none tracking-tight text-fg sm:text-5xl">
                {lang === 'ar' ? 'أسئلة تفصيلية' : 'Detailed Questions'}
              </h1>
              <p className="mt-3 text-sm text-text-secondary">
                {lang === 'ar'
                  ? 'أسئلة مخصصة حسب الخدمات التي اخترتها.'
                  : 'Tailored questions based on your selected services.'}
              </p>
            </div>

            {/* Logo Design questions */}
            {(hasLogo) && (
              <section className="mb-5 rounded-md border border-border bg-surface">
                <div className="border-b border-border p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded border border-accent/30 text-accent">◒</span>
                    <h2 className="font-semibold text-fg">{lang === 'ar' ? 'أسئلة تصميم الشعار' : 'Logo Design Questions'}</h2>
                  </div>
                </div>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  {field('logo_language', i18n.logoLanguage, 'text')}
                  {field('logo_status', i18n.logoStatus, 'select', lang === 'ar' ? 'لا يوجد شعار حالياً,يوجد شعار يحتاج تطوير,يوجد شعار وأريد إعادة تصميم بالكامل' : 'No current logo,Have a logo that needs refinement,Have a logo, want a full redesign')}
                  {field('logo_impressions', i18n.logoImpressions, 'textarea')}
                  {field('logo_forbidden', i18n.logoForbidden, 'textarea')}
                  {field('logo_style', i18n.logoStyle, 'select', 'Modern,Minimal,Classic,Playful,Luxury,Geometric,Hand-drawn,Abstract,Lettermark,Wordmark')}
                  {field('logo_references', i18n.logoReferences, 'textarea')}
                  {field('logo_usage', i18n.logoUsage, 'textarea')}
                  {field('logo_notes', i18n.logoNotes, 'textarea')}
                </div>
              </section>
            )}

            {/* Visual Identity questions */}
            {hasIdentity && (
              <section className="mb-5 rounded-md border border-border bg-surface">
                <div className="border-b border-border p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded border border-accent/30 text-accent">✦</span>
                    <h2 className="font-semibold text-fg">{lang === 'ar' ? 'أسئلة الهوية البصرية' : 'Visual Identity Questions'}</h2>
                  </div>
                </div>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  {/* If only VI (no logo), ask about existing logo basis */}
                  {!hasLogo && field('identity_base', i18n.identityBase, 'select', lang === 'ar' ? 'حول شعار قائم,شعار + هوية كاملة' : 'Around existing logo,Full Logo + Identity')}
                  {field('identity_scope', i18n.identityScope, 'textarea')}
                  {field('identity_personality', i18n.identityPersonality, 'text')}
                  {field('identity_colors', i18n.identityColors, 'textarea')}
                  {field('identity_typography', i18n.identityTypography, 'textarea')}
                  {field('identity_assets', i18n.identityAssets, 'textarea')}
                </div>
              </section>
            )}

            {/* Company Profile questions */}
            {hasProfile && (
              <section className="mb-5 rounded-md border border-border bg-surface">
                <div className="border-b border-border p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded border border-accent/30 text-accent">▤</span>
                    <h2 className="font-semibold text-fg">{lang === 'ar' ? 'أسئلة بروفايل الشركة' : 'Company Profile Questions'}</h2>
                  </div>
                </div>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  {field('profile_business_type', i18n.profileBusinessType, 'text')}
                  {field('profile_goal', i18n.profileGoal, 'textarea')}
                  {field('profile_audience', i18n.profileAudience, 'textarea')}
                  {field('profile_current', i18n.profileCurrent, 'select', lang === 'ar' ? 'لا يوجد,نعم ويحتاج تحديث,نعم وأريد إعادة تصميم' : 'None,Yes, needs updating,Yes, want a redesign')}
                  {field('profile_language', i18n.profileLanguage, 'select', 'Arabic,English,Bilingual')}
                  {field('profile_sections', i18n.profileSections, 'textarea')}
                  {field('profile_focus', i18n.profileFocus, 'textarea')}
                  {field('profile_content_status', i18n.profileContentStatus, 'select', lang === 'ar' ? 'جاهز,جزئي,لا يوجد' : 'Ready,Partial,None')}
                  {field('profile_files_status', i18n.profileFilesStatus, 'select', lang === 'ar' ? 'جاهزة,جزئية,لا توجد' : 'Ready,Partial,None')}
                  {field('profile_references', i18n.profileReferences, 'textarea')}
                </div>
              </section>
            )}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStage('services')} className={secondaryButtonClassName}>
                <ArrowLeft className="h-4 w-4" /> {i18n.back}
              </button>
              <button onClick={goFinal} className={primaryButtonClassName}>
                {i18n.next} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {/* ── Stage 3: Final review & submit ────────────────────── */}
        {stage === 'final' && (
          <>
            <div className="mb-8">
              <h1 className="font-display text-4xl leading-none tracking-tight text-fg sm:text-5xl">
                {lang === 'ar' ? 'مراجعة وإرسال' : 'Review & Submit'}
              </h1>
              <p className="mt-3 text-sm text-text-secondary">
                {lang === 'ar'
                  ? 'راجع البيانات وأضف أي تفاصيل أخيرة قبل الإرسال.'
                  : 'Review your data and add any final details before submission.'}
              </p>
            </div>

            <section className="rounded-md border border-border bg-surface">
              <div className="border-b border-border p-5">
                <h2 className="font-semibold text-fg">{lang === 'ar' ? 'تفاصيل أخيرة' : 'Final Details'}</h2>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2">
                {field('delivery_date', i18n.deliveryDate, 'date')}
                {field('additional_notes', i18n.additionalNotes, 'textarea')}
              </div>
            </section>

            {/* File upload */}
            <section className="mt-5 rounded-md border border-border bg-surface">
              <div className="p-5">
                <label className="flex cursor-pointer items-center gap-3 rounded border border-dashed border-line-light p-4 text-sm text-text-secondary hover:border-accent">
                  <CloudUpload className="h-5 w-5 text-accent" />
                  <span>{i18n.uploadLabel}</span>
                  <input className="hidden" type="file" multiple onChange={(e) => void upload(e.target.files)} />
                </label>
                {attachments.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {attachments.map((f) => (
                      <li key={f.name} className="flex items-center gap-2 text-xs text-text-secondary">
                        <FileText className="h-3.5 w-3.5 text-accent" /> {f.name}
                        <span className="text-text-tertiary">({Math.ceil(f.size / 1024)} KB)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Confirmation */}
            <section className="mt-5 rounded-md border border-border bg-surface p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span className="text-sm text-text-secondary">{i18n.confirmLabel}</span>
              </label>
            </section>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStage('branching')} className={secondaryButtonClassName}>
                <ArrowLeft className="h-4 w-4" /> {i18n.back}
              </button>
              <button onClick={() => void submit()} disabled={submitting || !confirmed} className={primaryButtonClassName}>
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? i18n.submitting : i18n.submitButton}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
