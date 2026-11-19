import { cn } from '@/lib/utils'

const STEPS = {
  en: ['Choose a form', 'Share your brief', 'Confirmation'],
  ar: ['اختيار النموذج', 'تعبئة الطلب', 'تأكيد الإرسال'],
} as const

export function RequestSteps({ current, lang = 'en', className }: { current: 1 | 2 | 3; lang?: 'en' | 'ar'; className?: string }) {
  return (
    <ol className={cn('grid max-w-2xl grid-cols-3 gap-3', className)} aria-label={lang === 'ar' ? 'خطوات إرسال الطلب' : 'Request steps'}>
      {STEPS[lang].map((label, index) => (
        <li
          key={label}
          aria-current={index + 1 === current ? 'step' : undefined}
          className={cn('min-w-0 border-t-2 pt-3 text-xs leading-5', index + 1 === current ? 'border-accent font-semibold text-fg' : 'border-border text-text-secondary')}
        >
          <span className="me-1 font-mono" aria-hidden="true" dir="ltr">0{index + 1}</span> {label}
        </li>
      ))}
    </ol>
  )
}
