'use client'

import React from 'react'
import { ThemeProvider } from '@/contexts/theme-context'
import { LanguageProvider } from '@/contexts/language-context'
import { AccentProvider } from '@/contexts/accent-context'
import { AuthProvider } from '@/contexts/auth-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AccentProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </AccentProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
