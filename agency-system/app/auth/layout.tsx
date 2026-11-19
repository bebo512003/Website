import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Secure login for existing team and client accounts. Public project requests do not require an account.',
}

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
