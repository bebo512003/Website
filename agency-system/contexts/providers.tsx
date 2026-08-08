'use client'

import React from 'react'
import { ThemeProvider } from '@/contexts/theme-context'
import { AccentProvider } from '@/contexts/accent-context'
import { AuthProvider } from '@/contexts/auth-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AccentProvider>
        <AuthProvider>{children}</AuthProvider>
      </AccentProvider>
    </ThemeProvider>
  )
}
