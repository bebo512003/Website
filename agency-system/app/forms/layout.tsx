import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Request a New Project — Agency OS',
  description: 'Choose a published project request form and submit your brief without creating an account.',
}

export default function PublicFormsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
