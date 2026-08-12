import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Project Request Form — Agency OS',
  description: 'Complete and submit a published Agency OS project request form without creating an account.',
}

export default function PublicFormLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
