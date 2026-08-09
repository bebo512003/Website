import type { Metadata } from 'next'
import { PortfolioProjectPage } from '@/components/portfolio/portfolio-project-page'

export const metadata: Metadata = {
  title: 'Project — Agency OS Portfolio',
  description: 'Project details from the Agency OS public portfolio.',
}

export default function PortfolioProjectRoute() {
  return <PortfolioProjectPage />
}
