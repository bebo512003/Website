import type { Metadata } from 'next'
import { ClientLandingPage } from './_components/client-landing-page'

export const metadata: Metadata = {
  title: 'Agency OS — Build something extraordinary',
  description:
    'Start a new project, browse our portfolio of published work, and access the forms you need — all without an account. Sign in to access the staff workspace.',
}

export default function HomePage() {
  return <ClientLandingPage />
}
