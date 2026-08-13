import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Track your request — Agency OS',
  description: 'Check the live status of a submitted project request using your reference number. No account required.',
  path: '/track',
})

export default function TrackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
