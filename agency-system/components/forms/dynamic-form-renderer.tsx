'use client'

import { CloudUpload, FileText, LoaderCircle, Star, X } from 'lucide-react'
import type { FormQuestion } from '@/lib/supabase/types'
import {
  isChoiceType,
  isQuestionVisible,
  questionSection,
  ratingMax,
  isAnswerEmpty,
  QUESTION_TYPE_MAP,
  type AnswerMap,
  type AnswerValue,
  type UploadedFileMeta,
} from '@/lib/forms/question-types'
import { cn } from '@/lib/utils'
import { inputClassName } from '@/components/ui/page'
import { STORAGE_RULES } from '@/lib/storage-config'

// ── Dynamic form renderer ────────────────────────────────────────────────────
// Renders ANY form purely from its database configuration (form_questions rows).
// No question, label, option, or order is hardcoded — that is what allows admins
// to publish brand-new forms without a code change.
//
// The component is controlled: the parent owns the `values` map, file uploads,
// validation, and the submit action, so the same renderer powers the public
// respondent page and the admin builder preview.

export type RendererLang = 'ar' | 'en'

export type DynamicFormRendererProps = {
  questions: FormQuestion[]
  values: AnswerMap
  onAnswer: (questionId: string, value: AnswerValue) => void
  /** Called when the respondent picks a file for a file_upload question. The
   *  parent uploads it (uploadFormFile) and stores the UploadedFileMeta via onAnswer. */
  onFileSelect?: (question: FormQuestion, file: File) => void
  onFileRemove?: (question: FormQuestion, index: number) => void
  uploadingQuestionId?: string | null
  disabled?: boolean
  lang?: RendererLang
  errors?: Record<string, string>
}

const dict = (lang: RendererLang) => ({
  required: lang === 'ar' ? 'مطلوب' : 'Required',
  choose: lang === 'ar' ? 'اختر…' : 'Choose…',
  yes: lang === 'ar' ? 'نعم' : 'Yes',
  no: lang === 'ar' ? 'لا' : 'No',
  upload: lang === 'ar' ? 'ارفع ملفاً' : 'Upload a file',
  uploading: lang === 'ar' ? 'جارٍ الرفع…' : 'Uploading…',
  fileHint: lang === 'ar' ? 'PDF، الصور، المستندات، الملفات المضغوطة (حتى 20 ميجابايت)' : 'PDF, Images, Documents, Archives (max 20 MB)',
  maxFilesReached: lang === 'ar' ? 'تم الوصول للحد الأقصى (10 ملفات)' : 'Maximum 10 files reached',
})

export function DynamicFormRenderer({
  questions,
  values,
  onAnswer,
  onFileSelect,
  onFileRemove,
  uploadingQuestionId = null,
  disabled = false,
  lang = 'ar',
  errors = {},
}: DynamicFormRendererProps) {
  const t = dict(lang)
  const ordered = [...questions].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))

  const stringValue = (id: string) => {
    const value = values[id]
    return typeof value === 'string' ? value : ''
  }
  const arrayValue = (id: string) => {
    const value = values[id]
    return Array.isArray(value) ? value : []
  }
  const fileValue = (id: string): UploadedFileMeta[] => {
    const value = values[id]
    if (!Array.isArray(value)) return []
    return value.filter((item): item is UploadedFileMeta => typeof item === 'object' && item !== null && 'storage_path' in item)
  }
  const questionOptions = (question: FormQuestion): string[] =>
    Array.isArray(question.options) ? question.options.filter((o): o is string => typeof o === 'string') : []

  // ── Sections + conditional visibility ──────────────────────────────────────
  // Only questions whose show-if rule is satisfied (or that have none) are
  // rendered, then grouped into logical sections in definition order.
  const visible = ordered.filter((question) => isQuestionVisible(question, values))
  const sections: { name: string; questions: FormQuestion[] }[] = []
  for (const question of visible) {
    const name = questionSection(question.config)
    const last = sections[sections.length - 1]
    if (last && last.name === name) last.questions.push(question)
    else sections.push({ name, questions: [question] })
  }

  // Progress reflects how many of the currently-visible required questions are
  // answered, and which section the respondent is working through.
  const visibleRequired = visible.filter((q) => q.required)
  const answeredRequired = visibleRequired.filter((q) => !isAnswerEmpty(values[q.id])).length
  const progress = visibleRequired.length === 0 ? 100 : Math.round((answeredRequired / visibleRequired.length) * 100)
  const currentSectionIndex = sections.findIndex((section) => section.questions.some((q) => q.required && isAnswerEmpty(values[q.id])))
  const currentSection = currentSectionIndex === -1 ? sections.length - 1 : currentSectionIndex

  const fieldShell = (question: FormQuestion, span: boolean, control: React.ReactNode) => (
    <div id={`question-${question.id}`} key={question.id} className={cn('scroll-mt-24 text-sm text-text-secondary', span && 'sm:col-span-2')}>
      <span className="block font-medium text-fg">
        {question.label}
        {question.required && <span className="text-accent"> *</span>}
      </span>
      {question.help_text && <span className="mt-1 block text-xs text-text-tertiary">{question.help_text}</span>}
      {control}
      {errors[question.id] && <span className="mt-1.5 block text-xs text-red-400">{errors[question.id]}</span>}
    </div>
  )

  const optionPill = (active: boolean) =>
    cn(
      'flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm transition',
      active ? 'border-accent bg-accent/5 text-fg ring-1 ring-accent/30' : 'border-border bg-surface-raised text-text-secondary hover:border-line-light hover:text-fg',
      disabled && 'cursor-not-allowed opacity-60',
    )

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {/* Progress + current section */}
      {sections.length > 0 && (
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-tertiary">
            <span>
              {lang === 'ar' ? 'القسم' : 'Section'} {currentSection + 1} / {sections.length} · {sections[currentSection]?.name || (lang === 'ar' ? 'استبيان' : 'Form')}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="sm:col-span-2">
          {section.name && (
            <h3 className="mb-4 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {sectionIndex + 1}. {section.name}
            </h3>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            {section.questions.map((question) => {
        const meta = QUESTION_TYPE_MAP[question.question_type]
        const error = errors[question.id]

        // ── Textual input types ──────────────────────────────────────────
        if (question.question_type === 'short_text' || question.question_type === 'number' || question.question_type === 'date') {
          return fieldShell(
            question,
            false,
            <input
              type={question.question_type === 'short_text' ? 'text' : question.question_type}
              disabled={disabled}
              placeholder={question.placeholder || undefined}
              className={cn(inputClassName, 'mt-2', error && 'border-red-500/50')}
              value={stringValue(question.id)}
              onChange={(event) => onAnswer(question.id, event.target.value)}
            />,
          )
        }

        if (question.question_type === 'long_text') {
          return fieldShell(
            question,
            true,
            <textarea
              disabled={disabled}
              placeholder={question.placeholder || undefined}
              className={cn(inputClassName, 'mt-2 min-h-28', error && 'border-red-500/50')}
              value={stringValue(question.id)}
              onChange={(event) => onAnswer(question.id, event.target.value)}
            />,
          )
        }

        // ── Yes / No ─────────────────────────────────────────────────────
        if (question.question_type === 'yes_no') {
          const current = stringValue(question.id)
          return fieldShell(
            question,
            false,
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['yes', 'no'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAnswer(question.id, option)}
                  className={optionPill(current === option).concat(' justify-center')}
                >
                  {option === 'yes' ? t.yes : t.no}
                </button>
              ))}
            </div>,
          )
        }

        // ── Choice types ─────────────────────────────────────────────────
        if (isChoiceType(question.question_type)) {
          const options = questionOptions(question)
          if (question.question_type === 'dropdown') {
            return fieldShell(
              question,
              false,
              <select
                disabled={disabled}
                className={cn(inputClassName, 'mt-2', error && 'border-red-500/50')}
                value={stringValue(question.id)}
                onChange={(event) => onAnswer(question.id, event.target.value)}
              >
                <option value="">{question.placeholder || t.choose}</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>,
            )
          }
          if (question.question_type === 'single_choice') {
            const current = stringValue(question.id)
            return fieldShell(
              question,
              options.length > 3,
              <div className={cn('mt-2 grid gap-2', options.length > 2 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
                {options.map((option) => (
                  <button key={option} type="button" disabled={disabled} onClick={() => onAnswer(question.id, option)} className={optionPill(current === option)}>
                    <span className={cn('h-3.5 w-3.5 shrink-0 rounded-full border', current === option ? 'border-accent bg-accent' : 'border-line-light')} />
                    {option}
                  </button>
                ))}
              </div>,
            )
          }
          // multiple_choice
          const selected = arrayValue(question.id).filter((item): item is string => typeof item === 'string')
          const toggle = (option: string) =>
            onAnswer(question.id, selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])
          return fieldShell(
            question,
            options.length > 3,
            <div className={cn('mt-2 grid gap-2', options.length > 2 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
              {options.map((option) => {
                const active = selected.includes(option)
                return (
                  <button key={option} type="button" disabled={disabled} onClick={() => toggle(option)} className={optionPill(active)}>
                    <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border', active ? 'border-accent bg-accent text-accent-foreground' : 'border-line-light')}>
                      {active && <span className="block h-1.5 w-1.5 rounded-sm bg-accent-foreground" />}
                    </span>
                    {option}
                  </button>
                )
              })}
            </div>,
          )
        }

        // ── Rating ───────────────────────────────────────────────────────
        if (question.question_type === 'rating') {
          const max = ratingMax(question.config)
          const current = Number(stringValue(question.id)) || 0
          return fieldShell(
            question,
            false,
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
                <button
                  key={score}
                  type="button"
                  disabled={disabled}
                  aria-label={`${meta.labelEn}: ${score}/${max}`}
                  onClick={() => onAnswer(question.id, String(score))}
                  className="transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Star className={cn('h-6 w-6', score <= current ? 'fill-accent text-accent' : 'text-line-light')} />
                </button>
              ))}
              {current > 0 && <span className="ms-2 text-xs text-text-tertiary">{current}/{max}</span>}
            </div>,
          )
        }

        // ── File upload ──────────────────────────────────────────────────
        if (question.question_type === 'file_upload') {
          const files = fileValue(question.id)
          const uploading = uploadingQuestionId === question.id
          const maxReached = files.length >= 10
          return fieldShell(
            question,
            false,
            <div className="mt-2 space-y-2">
              <label className={cn('flex cursor-pointer items-center gap-3 rounded border border-dashed border-line-light p-4 text-sm text-text-secondary transition hover:border-accent', (disabled || maxReached) && 'cursor-not-allowed opacity-60')}>
                {uploading ? <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> : <CloudUpload className="h-5 w-5 text-accent" />}
                <div className="flex flex-col">
                  <span>{uploading ? t.uploading : maxReached ? t.maxFilesReached : t.upload}</span>
                  <span className="text-[11px] text-text-tertiary">{t.fileHint}</span>
                </div>
                <input
                  className="hidden"
                  type="file"
                  accept={STORAGE_RULES['form-files'].acceptAttribute}
                  disabled={disabled || uploading || maxReached}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file && onFileSelect) onFileSelect(question, file)
                    event.target.value = ''
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((file, index) => (
                    <li key={`${file.storage_path}-${index}`} className="flex items-center gap-2 text-xs text-text-secondary">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span className="truncate">{file.name}</span>
                      <span className="text-text-tertiary">({Math.ceil(file.size / 1024)} KB)</span>
                      {onFileRemove && !disabled && (
                        <button type="button" onClick={() => onFileRemove(question, index)} className="ms-auto text-text-tertiary hover:text-red-400" aria-label="Remove file">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>,
          )
        }

        // Unknown type (e.g. a type added by a future migration before the UI
        // registry catches up): fall back to plain text so the form still works.
        return fieldShell(
          question,
          false,
          <input
            type="text"
            disabled={disabled}
            placeholder={question.placeholder || undefined}
            className={cn(inputClassName, 'mt-2')}
            value={stringValue(question.id)}
            onChange={(event) => onAnswer(question.id, event.target.value)}
          />,
        )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
