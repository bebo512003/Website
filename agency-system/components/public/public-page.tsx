import type { ComponentProps, ReactNode } from 'react'
import { PublicSiteHeader } from './public-site-header'
import { PublicSiteFooter } from './public-site-footer'

type Props = ComponentProps<typeof PublicSiteHeader> & { children: ReactNode }

/** Common public chrome. The body inherits the same language and direction as the navigation. */
export function PublicPage({ children, lang = 'en', ...navigation }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <a href="#main-content" className="skip-link">{lang === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to main content'}</a>
      <PublicSiteHeader {...navigation} lang={lang} />
      <main id="main-content" tabIndex={-1} className="flex-1 scroll-mt-18">{children}</main>
      <PublicSiteFooter lang={lang} />
    </div>
  )
}
