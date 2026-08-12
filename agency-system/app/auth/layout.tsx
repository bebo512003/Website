import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login — Agency OS',
  description: 'Secure login for existing Agency OS team accounts. Public project requests do not require an account.',
}

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
