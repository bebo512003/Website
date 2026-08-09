import type { LucideIcon } from 'lucide-react'
import {
  AlignLeft,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ChevronsUpDown,
  Hash,
  ListChecks,
  Paperclip,
  Star,
  Type,
} from 'lucide-react'

// ── Question type registry ───────────────────────────────────────────────────
// This registry is the single frontend source of truth for question types.
// The form builder and the dynamic renderer both read it, so forms are never
// hardcoded — everything the UI knows about a type lives here.
//
// Adding a new question type later:
//   1. Allow the new value in the `form_questions.question_type` CHECK
//      constraint + validation branch of `submit_dynamic_form` (one migration).
//   2. Add one entry here.
//   3. Add one render branch in components/forms/dynamic-form-renderer.tsx
//      (and one snapshot format branch in formatAnswer if it is not string-based).

export type FormQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'yes_no'
  | 'dropdown'
  | 'number'
  | 'date'
  | 'file_upload'
  | 'rating'

export type QuestionTypeMeta = {
  type: FormQuestionType
  icon: LucideIcon
  labelEn: string
  labelAr: string
  descriptionEn: string
  descriptionAr: string
  /** Whether the builder shows the answer-options editor. */
  hasOptions: boolean
  /** Whether a placeholder is meaningful for this type. */
  hasPlaceholder: boolean
  /** First option rows prefilled when the builder creates this type. */
  defaultOptions?: string[]
  /** Default per-type config (e.g. rating_max). */
  defaultConfig?: Record<string, number | string>
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  {
    type: 'short_text', icon: Type, labelEn: 'Short text', labelAr: 'نص قصير',
    descriptionEn: 'One-line free text answer.', descriptionAr: 'إجابة نصية من سطر واحد.',
    hasOptions: false, hasPlaceholder: true,
  },
  {
    type: 'long_text', icon: AlignLeft, labelEn: 'Long text', labelAr: 'نص طويل',
    descriptionEn: 'Multi-line paragraph answer.', descriptionAr: 'إجابة نصية متعددة الأسطر.',
    hasOptions: false, hasPlaceholder: true,
  },
  {
    type: 'single_choice', icon: CircleDot, labelEn: 'Single choice', labelAr: 'اختيار واحد',
    descriptionEn: 'Pick exactly one option.', descriptionAr: 'اختيار إجابة واحدة من عدة خيارات.',
    hasOptions: true, hasPlaceholder: false, defaultOptions: ['Option 1', 'Option 2'],
  },
  {
    type: 'multiple_choice', icon: ListChecks, labelEn: 'Multiple choice', labelAr: 'اختيارات متعددة',
    descriptionEn: 'Pick any number of options.', descriptionAr: 'اختيار أكثر من إجابة.',
    hasOptions: true, hasPlaceholder: false, defaultOptions: ['Option 1', 'Option 2'],
  },
  {
    type: 'yes_no', icon: CheckCircle2, labelEn: 'Yes / No', labelAr: 'نعم / لا',
    descriptionEn: 'Simple yes or no answer.', descriptionAr: 'إجابة بنعم أو لا فقط.',
    hasOptions: false, hasPlaceholder: false,
  },
  {
    type: 'dropdown', icon: ChevronsUpDown, labelEn: 'Dropdown', labelAr: 'قائمة منسدلة',
    descriptionEn: 'Pick one option from a list.', descriptionAr: 'اختيار إجابة من قائمة منسدلة.',
    hasOptions: true, hasPlaceholder: true, defaultOptions: ['Option 1', 'Option 2'],
  },
  {
    type: 'number', icon: Hash, labelEn: 'Number', labelAr: 'رقم',
    descriptionEn: 'Numeric answers only.', descriptionAr: 'إجابة رقمية فقط.',
    hasOptions: false, hasPlaceholder: true,
  },
  {
    type: 'date', icon: CalendarDays, labelEn: 'Date', labelAr: 'تاريخ',
    descriptionEn: 'Date picker answer.', descriptionAr: 'اختيار تاريخ.',
    hasOptions: false, hasPlaceholder: false,
  },
  {
    type: 'file_upload', icon: Paperclip, labelEn: 'File upload', labelAr: 'رفع ملف',
    descriptionEn: 'Respondent attaches a file.', descriptionAr: 'إرفاق ملف مع الإجابة.',
    hasOptions: false, hasPlaceholder: false,
  },
  {
    type: 'rating', icon: Star, labelEn: 'Rating', labelAr: 'تقييم',
    descriptionEn: 'Star rating from 1 up to a max you choose.', descriptionAr: 'تقييم بالنجوم من 1 إلى الحد الأقصى الذي تحدده.',
    hasOptions: false, hasPlaceholder: false, defaultConfig: { rating_max: 5 },
  },
]

export const QUESTION_TYPE_MAP: Record<FormQuestionType, QuestionTypeMeta> = Object.fromEntries(
  QUESTION_TYPES.map((meta) => [meta.type, meta]),
) as Record<FormQuestionType, QuestionTypeMeta>

/** Types the submit RPC stores as plain strings vs. string arrays vs. file arrays. */
export function isChoiceType(type: FormQuestionType): boolean {
  return type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown'
}

export function ratingMax(config: unknown): number {
  const raw = config && typeof config === 'object' ? (config as Record<string, unknown>).rating_max : null
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(parsed)) return 5
  return Math.min(10, Math.max(1, Math.round(parsed)))
}

/** The value a respondent can submit for a question in this dynamic system. */
export type UploadedFileMeta = { storage_path: string; name: string; size: number; mime_type: string | null }
export type AnswerValue = string | string[] | UploadedFileMeta[]
export type AnswerMap = Record<string, AnswerValue>

export function isAnswerEmpty(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  return value.length === 0
}

/** Human-readable rendering of a stored answer snapshot (submission views). */
export function formatAnswer(value: unknown, lang: 'ar' | 'en' = 'en'): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return value
      .map((item) => (item && typeof item === 'object' && 'name' in item ? String((item as UploadedFileMeta).name) : String(item)))
      .join(lang === 'ar' ? '، ' : ', ')
  }
  if (typeof value === 'string') {
    if (value === 'yes') return lang === 'ar' ? 'نعم' : 'Yes'
    if (value === 'no') return lang === 'ar' ? 'لا' : 'No'
    return value.trim() === '' ? '—' : value
  }
  return String(value)
}
