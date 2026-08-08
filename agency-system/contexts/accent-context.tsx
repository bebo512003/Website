'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

type AccentColor = {
  name: string
  hsl: string
  glow: string
}

const accentColors: AccentColor[] = [
  { name: 'Red', hsl: '358 65% 44%', glow: '358 75% 50%' },
  { name: 'Blue', hsl: '217 91% 60%', glow: '217 91% 70%' },
  { name: 'Green', hsl: '142 71% 45%', glow: '142 71% 55%' },
  { name: 'Purple', hsl: '262 83% 58%', glow: '262 83% 68%' },
  { name: 'Yellow', hsl: '45 93% 47%', glow: '45 93% 57%' },
  { name: 'Pink', hsl: '330 81% 60%', glow: '330 81% 70%' },
  { name: 'Orange', hsl: '24 95% 53%', glow: '24 95% 63%' },
  { name: 'Cyan', hsl: '188 93% 40%', glow: '188 93% 50%' },
]

interface AccentContextType {
  accent: AccentColor
  setAccent: (accent: AccentColor) => void
  accentColors: AccentColor[]
}

const AccentContext = createContext<AccentContextType | undefined>(undefined)

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>(accentColors[0])

  useEffect(() => {
    const savedAccent = localStorage.getItem('agency-os-accent')
    if (savedAccent) {
      const found = accentColors.find(c => c.name === savedAccent)
      if (found) setAccentState(found)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', accent.hsl)
    root.style.setProperty('--accent-glow', accent.glow)
    
    localStorage.setItem('agency-os-accent', accent.name)
  }, [accent])

  const setAccent = (color: AccentColor) => {
    setAccentState(color)
  }

  return (
    <AccentContext.Provider value={{ accent, setAccent, accentColors }}>
      {children}
    </AccentContext.Provider>
  )
}

export function useAccent() {
  const context = useContext(AccentContext)
  if (context === undefined) {
    throw new Error('useAccent must be used within an AccentProvider')
  }
  return context
}
