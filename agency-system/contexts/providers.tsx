'use client'

import React from 'react'
import { ThemeProvider } from '@/contexts/theme-context'
import { AuthProvider } from '@/contexts/auth-context'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
