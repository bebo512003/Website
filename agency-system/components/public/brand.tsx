import { SITE_MOTTO_AR, SITE_NAME, SITE_NAME_AR, SITE_TAGLINE } from '@/lib/site'
import { cn } from '@/lib/utils'

/** 96 × 142 unit grounded B, drawn from the identity's construction spec. */
export function BrandMarkPaths({ small = false, monochrome = false }: { small?: boolean; monochrome?: boolean }) {
  return (
    <>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={small
          ? 'M0 0h80v40h16v52H0zM24 14v12h36V14zM24 60v12h52V60z'
          : 'M0 0h80v40h16v52H0zM24 16v8h36v-8zM24 62v8h52v-8z'}
      />
      <path fill={monochrome ? 'currentColor' : 'var(--signal-red)'} d={small
        ? 'M44 92h8v14h44v8H0v-8h44zM16 120h64v8H16z'
        : 'M44 92h8v14h44v8H0v-8h44zM16 120h64v8H16zM32 134h32v8H32z'}
      />
    </>
  )
}

export function BrandMark({ className, small = false, monochrome = false }: { className?: string; small?: boolean; monochrome?: boolean }) {
  return (
    <svg viewBox={small ? '0 0 96 128' : '0 0 96 142'} width="96" height={small ? '128' : '142'} className={cn('shrink-0 text-fg', className)} aria-hidden="true" focusable="false">
      <BrandMarkPaths small={small} monochrome={monochrome} />
    </svg>
  )
}

export function BrandLockup({ lang = 'en', compact = false, monochrome = false }: { lang?: 'en' | 'ar'; compact?: boolean; monochrome?: boolean }) {
  const isAr = lang === 'ar'
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5 sm:gap-3">
      <BrandMark className={compact ? 'h-8 w-6' : 'h-9 w-7 sm:h-10 sm:w-8'} small={compact} monochrome={monochrome} />
      <span className="min-w-0">
        <span className={cn('block font-bold text-fg', compact ? 'text-base leading-6' : 'text-base leading-6 sm:text-[22px]')}>
          {isAr ? SITE_NAME_AR : SITE_NAME}
        </span>
        <span className={cn('block text-xs font-normal leading-4 text-text-secondary sm:text-sm sm:leading-5', isAr && !compact && 'hidden sm:block lg:hidden xl:block')}>
          {isAr ? SITE_MOTTO_AR : SITE_TAGLINE}
        </span>
      </span>
    </span>
  )
}
