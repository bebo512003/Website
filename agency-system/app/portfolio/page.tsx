import type { Metadata } from 'next'
import { PortfolioLandingPage } from '@/components/portfolio/portfolio-landing-page'

export const metadata: Metadata = {
  title: 'Portfolio — Agency OS',
  description: 'Selected branding, visual identity, and design work by Agency OS.',
}

export default function PortfolioPage() {
  return <PortfolioLandingPage />
}
