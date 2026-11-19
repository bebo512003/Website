import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SITE_NAME, SITE_NAME_AR, SITE_NAVIGATION } from '@/lib/site'
import { BrandLockup } from './brand'
import { ContactLinks } from './contact-links'
import { PublicLink } from './public-link'

export function PublicSiteFooter({ lang = 'en' }: { lang?: 'en' | 'ar' }) {
  const isAr = lang === 'ar'
  const name = isAr ? SITE_NAME_AR : SITE_NAME

  return (
    <footer className="border-t border-border bg-bg" dir={isAr ? 'rtl' : 'ltr'} lang={lang}>
      <div className="site-container">
        <div className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.7fr)] lg:gap-10 lg:py-16">
          <div>
            <Link href="/" aria-label={isAr ? `${name} — الرئيسية` : `${name} — Home`} className="inline-flex">
              <BrandLockup lang={lang} />
            </Link>
            <p className="mt-4 max-w-64 text-sm text-text-secondary">
              {isAr ? 'تصميم هويات للمؤسسين والشركات النامية في مصر والخليج.' : 'Brand identity design for founders and growing businesses in Egypt and the Gulf.'}
            </p>
          </div>
          <div id="contact" className="min-w-0 scroll-mt-24">
            <h2 className="type-label text-text-secondary">{isAr ? 'التواصل' : 'Contact'}</h2>
            <ContactLinks lang={lang} className="mt-2" />
          </div>
          <div>
            <h2 className="type-label text-text-secondary">{isAr ? 'استكشف' : 'Explore'}</h2>
            <ul className="mt-3 grid gap-1">
              {SITE_NAVIGATION.filter((link) => link.key !== 'contact').map((link) => (
                <li key={link.key}><PublicLink href={link.href} className="inline-block py-1 text-sm text-fg hover:underline hover:underline-offset-4">{link[lang]}</PublicLink></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-5 text-xs text-text-secondary">
          <span>© {new Date().getFullYear()} {name}</span>
          <Link href="/auth" className="inline-flex items-center gap-1.5 text-fg hover:underline hover:underline-offset-4">
            {isAr ? 'دخول الفريق والعملاء' : 'Team and client login'} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </footer>
  )
}
