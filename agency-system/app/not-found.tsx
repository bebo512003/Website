import Link from 'next/link'
import { ArrowRight, Home } from 'lucide-react'
import { PublicPage } from '@/components/public/public-page'
import { PublicPageIntro } from '@/components/public/public-page-sections'
import { primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { SELECTED_WORK_PATH } from '@/lib/site'

export default function NotFound() {
  return (
    <PublicPage>
      <PublicPageIntro
        eyebrow="404 / Page not found"
        title="This page is not available."
        description="The link may be incorrect, or the content is no longer public."
        actions={<>
          <Link href="/" className={primaryButtonClassName}><Home className="size-4" aria-hidden="true" /> Home</Link>
          <a href={SELECTED_WORK_PATH} className={secondaryButtonClassName}>Portfolio <ArrowRight className="size-4" aria-hidden="true" /></a>
        </>}
      />
    </PublicPage>
  )
}
