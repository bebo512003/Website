'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronLeft, CloudUpload, FileText, LoaderCircle, Save, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createIntakeForm, submitIntakeForm, updateIntakeForm, uploadIntakeAttachment } from '@/lib/supabase/database'
import type { IntakeForm, Json } from '@/lib/supabase/types'
import { InlineAlert, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

type Service = 'logo_design' | 'visual_identity' | 'company_profile'
type Values = Record<string, string>
const services: { id: Service; title: string; description: string; icon: string }[] = [
  { id: 'logo_design', title: 'Logo Design', description: 'هوية الشعار، الاتجاه الإبداعي، وملفات الاستخدام.', icon: '◒' },
  { id: 'visual_identity', title: 'Visual Identity', description: 'نظام بصري متكامل يشمل الألوان والخطوط والتطبيقات.', icon: '✦' },
  { id: 'company_profile', title: 'Company Profile', description: 'محتوى وبنية وتصميم بروفايل الشركة.', icon: '▤' },
]
const baseFields = [
  ['contact_name', 'الاسم الكامل', 'text'], ['contact_email', 'البريد الإلكتروني', 'email'], ['phone', 'رقم الجوال', 'tel'],
  ['company_name', 'اسم الشركة / العلامة', 'text'], ['industry', 'القطاع أو مجال العمل', 'text'], ['website', 'الموقع أو حسابات التواصل', 'url'],
]
const branchFields: Record<Service, [string, string, string, string?][]> = {
  logo_design: [
    ['brand_description', 'عرّفنا بعلامتك التجارية', 'textarea'], ['audience', 'من هو جمهورك المستهدف؟', 'textarea'],
    ['logo_style', 'أي أسلوب تفضّل؟', 'select', 'Modern,Minimal,Classic,Playful,Luxury'], ['logo_usage', 'أين سيُستخدم الشعار؟', 'textarea'],
    ['color_preference', 'الألوان المفضّلة أو التي يجب تجنبها', 'textarea'],
  ],
  visual_identity: [
    ['brand_description', 'عرّفنا بعلامتك ورسالتها', 'textarea'], ['audience', 'الجمهور المستهدف', 'textarea'],
    ['existing_assets', 'هل يوجد شعار أو عناصر حالية؟', 'textarea'], ['identity_scope', 'ما التطبيقات المطلوبة؟', 'textarea'],
    ['brand_personality', 'صف شخصية العلامة بثلاث كلمات', 'text'],
  ],
  company_profile: [
    ['company_overview', 'نبذة عن الشركة والخدمات', 'textarea'], ['audience', 'من سيقرأ البروفايل؟', 'textarea'],
    ['profile_language', 'لغة البروفايل', 'select', 'Arabic,English,Bilingual'], ['page_count', 'عدد الصفحات المتوقع (إن وجد)', 'number'],
    ['content_ready', 'هل المحتوى والنصوص جاهزة؟', 'select', 'Yes,Partially,No'], ['profile_goal', 'الهدف الرئيسي من البروفايل', 'textarea'],
  ],
}

const empty: Values = Object.fromEntries(baseFields.map(([key]) => [key, '']))

export default function FormsPage() {
  const { user } = useAuth()
  const [service, setService] = useState<Service | null>(null)
  const [values, setValues] = useState<Values>(empty)
  const [form, setForm] = useState<IntakeForm | null>(null)
  const [attachments, setAttachments] = useState<{ name: string; size: number }[]>([])
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const payload = useCallback(() => ({
    service_type: service,
    contact_name: values.contact_name?.trim() || null,
    contact_email: values.contact_email?.trim() || null,
    company_name: values.company_name?.trim() || null,
    phone: values.phone?.trim() || null,
    data: values as Json,
  }), [service, values])

  const save = useCallback(async () => {
    if (!service || !user) return
    setStatus('saving'); setError('')
    const result = form ? await updateIntakeForm(form.id, payload()) : await createIntakeForm(payload())
    if (result.error || !result.data) { setStatus('error'); setError(result.error || 'تعذر حفظ المسودة.'); return }
    if (!form) setForm(result.data)
    setStatus('saved')
  }, [form, payload, service, user])

  // Every meaningful answer is saved after a short pause; the first save creates the master draft.
  useEffect(() => {
    if (!service || !user) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [service, values, save, user])

  const chooseService = (next: Service) => { setService(next); setForm(null); setValues(empty); setAttachments([]); setStatus('idle'); setError('') }
  const change = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }))

  const upload = async (files: FileList | null) => {
    if (!files?.length || !user) return
    // Create a draft immediately if upload is the first action.
    // State can update asynchronously, so keep the returned record locally.
    let target = form
    if (!target) {
      const result = await createIntakeForm(payload())
      if (result.error || !result.data) { setError(result.error || 'احفظ البيانات أولاً قبل الرفع.'); return }
      target = result.data; setForm(target)
    }
    setStatus('saving')
    for (const file of Array.from(files)) {
      const result = await uploadIntakeAttachment(target.id, user.id, file)
      if (result.error) { setError(result.error); setStatus('error'); return }
      setAttachments((current) => [...current, { name: file.name, size: file.size }])
    }
    setStatus('saved')
  }

  const submit = async () => {
    if (!form) { await save(); return setError('تم إنشاء المسودة. راجع الحقول ثم أرسل مرة أخرى.') }
    if (!values.contact_name || !values.company_name) return setError('يرجى إدخال الاسم واسم الشركة قبل الإرسال.')
    setSubmitting(true); setError('')
    const result = await submitIntakeForm(form.id)
    setSubmitting(false)
    if (result.error || !result.data) return setError(result.error || 'تعذر إرسال النموذج.')
    setForm(result.data); setStatus('saved')
  }

  const current = useMemo(() => services.find((item) => item.id === service), [service])
  if (!service) return <Page><div dir="rtl"><PageHeader eyebrow="FORMS / MASTER INTAKE" title="طلب خدمة جديد" description="ابدأ بنموذج موحّد ثم ستظهر لك الأسئلة المناسبة للخدمة التي تختارها." /><div className="grid gap-4 md:grid-cols-3">{services.map((item) => <button key={item.id} onClick={() => chooseService(item.id)} className="group rounded-md border border-border bg-surface p-6 text-right transition hover:border-accent hover:bg-surface-raised"><span className="flex h-11 w-11 items-center justify-center rounded border border-border text-xl text-accent">{item.icon}</span><h2 className="mt-6 text-xl font-semibold text-fg">{item.title}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{item.description}</p><span className="mt-6 inline-flex items-center gap-1 text-xs font-semibold text-accent">ابدأ الطلب <ChevronLeft className="h-4 w-4" /></span></button>)}</div></div></Page>

  const fields = [...baseFields, ...branchFields[service]]
  const submitted = form?.status === 'submitted'
  return <Page><div dir="rtl">
    <PageHeader eyebrow="FORMS / MASTER INTAKE" title={current?.title || 'نموذج الطلب'} description="يتم الحفظ تلقائياً أثناء تعبئة النموذج. ستُنشأ جهة اتصال ومشروع تلقائياً عند الإرسال." action={<button onClick={() => setService(null)} className={secondaryButtonClassName}>تغيير الخدمة</button>} />
    {error && <InlineAlert>{error}</InlineAlert>}
    {submitted && <InlineAlert tone="success"><span>تم إرسال الطلب وإنشاء المشروع تلقائياً.</span>{form?.project_id && <Link className="mr-2 underline" href={`/projects/${form.project_id}`}>فتح المشروع</Link>}</InlineAlert>}
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <Panel><div className="border-b border-border p-5"><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-accent" /><div><h2 className="font-semibold">{current?.title}</h2><p className="mt-1 text-xs text-text-tertiary">الحقول بعلامة * ضرورية لإرسال الطلب.</p></div></div></div>
        <div className="grid gap-5 p-5 sm:grid-cols-2">{fields.map(([key, label, type, options]) => <label key={key} className={`text-sm text-text-secondary ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>{label}{['contact_name', 'company_name'].includes(key) && <span className="text-accent"> *</span>}{type === 'textarea' ? <textarea disabled={submitted} className={`${inputClassName} mt-2 min-h-28`} value={values[key] || ''} onChange={(e) => change(key, e.target.value)} /> : type === 'select' ? <select disabled={submitted} className={`${inputClassName} mt-2`} value={values[key] || ''} onChange={(e) => change(key, e.target.value)}><option value="">اختر إجابة</option>{options?.split(',').map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input disabled={submitted} type={type} className={`${inputClassName} mt-2`} value={values[key] || ''} onChange={(e) => change(key, e.target.value)} />}</label>)}</div>
        <div className="border-t border-border p-5"><label className="flex cursor-pointer items-center gap-3 rounded border border-dashed border-line-light p-4 text-sm text-text-secondary hover:border-accent"><CloudUpload className="h-5 w-5 text-accent" /><span>ارفع ملفات مرجعية، شعارات سابقة، أو محتوى البروفايل</span><input disabled={submitted} className="hidden" type="file" multiple onChange={(e) => void upload(e.target.files)} /></label>{attachments.length > 0 && <ul className="mt-3 space-y-2">{attachments.map((file) => <li key={file.name} className="flex items-center gap-2 text-xs text-text-secondary"><FileText className="h-3.5 w-3.5 text-accent" />{file.name} <span className="text-text-tertiary">({Math.ceil(file.size / 1024)} KB)</span></li>)}</ul>}</div>
        {!submitted && <div className="flex justify-end border-t border-border p-5"><button onClick={() => void submit()} disabled={submitting} className={primaryButtonClassName}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{submitting ? 'جارٍ الإرسال…' : 'إرسال الطلب وإنشاء المشروع'}</button></div>}
      </Panel>
      <aside className="space-y-4"><Panel className="p-5"><p className="font-mono-tech text-[10px] text-text-tertiary">DRAFT STATUS</p><div className="mt-3 flex items-center gap-2 text-sm font-medium">{status === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> : <Save className="h-4 w-4 text-accent" />}{status === 'saving' ? 'جارٍ الحفظ…' : status === 'saved' ? 'تم الحفظ تلقائياً' : 'مسودة جديدة'}</div><p className="mt-3 text-xs leading-5 text-text-tertiary">تبقى إجاباتك محفوظة كمسودة حتى قبل إرسال الطلب.</p></Panel><Panel className="p-5"><p className="font-mono-tech text-[10px] text-text-tertiary">AUTOMATION</p><ol className="mt-3 space-y-3 text-xs leading-5 text-text-secondary"><li>1. حفظ النموذج والملفات المرجعية.</li><li>2. مطابقة العميل بالبريد الإلكتروني أو إنشاؤه.</li><li>3. إنشاء مشروع {current?.title} وربطه بالطلب.</li></ol></Panel></aside>
    </div>
  </div></Page>
}
