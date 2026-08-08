'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

type Language = 'ar' | 'en'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: (key: string) => string
}

// قاموس الترجمة البسيط
const translations: Record<string, Record<Language, string>> = {
  // TopBar
  'search.placeholder': {
    ar: 'ابحث في المشاريع، العملاء، الملفات...',
    en: 'Search projects, clients, files...',
  },
  'user.role': {
    ar: 'مدير المشروع',
    en: 'Project Director',
  },
  
  // Sidebar
  'nav.dashboard': { ar: 'الرئيسية', en: 'Dashboard' },
  'nav.projects': { ar: 'المشاريع', en: 'Projects' },
  'nav.clients': { ar: 'العملاء', en: 'Clients' },
  'nav.tasks': { ar: 'المهام', en: 'Tasks' },
  'nav.files': { ar: 'الملفات', en: 'Files' },
  'nav.ai': { ar: 'المساعد الذكي', en: 'AI Assistant' },
  'nav.reports': { ar: 'التقارير', en: 'Reports' },
  'nav.templates': { ar: 'القوالب', en: 'Templates' },
  'nav.settings': { ar: 'الإعدادات', en: 'Settings' },
  
  // Dashboard
  'dashboard.welcome': { ar: 'مرحباً', en: 'Welcome' },
  'dashboard.subtitle': {
    ar: 'هنا نظرة عامة على مشاريعك ووكالتك',
    en: 'Here\'s an overview of your projects and agency',
  },
  'dashboard.activeProjects': { ar: 'المشاريع النشطة', en: 'Active Projects' },
  'dashboard.clients': { ar: 'العملاء', en: 'Clients' },
  'dashboard.completedTasks': { ar: 'المهام المكتملة', en: 'Completed Tasks' },
  'dashboard.pending': { ar: 'في الانتظار', en: 'Pending' },
  
  // Common
  'common.thisMonth': { ar: 'هذا الشهر', en: 'This month' },
  'common.thisWeek': { ar: 'هذا الأسبوع', en: 'This week' },
  'common.viewAll': { ar: 'عرض الكل', en: 'View all' },
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('ar')

  useEffect(() => {
    const savedLang = localStorage.getItem('agency-os-language') as Language
    if (savedLang) {
      setLanguage(savedLang)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('lang', language)
    root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr')
    
    localStorage.setItem('agency-os-language', language)
  }, [language])

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ar' ? 'en' : 'ar')
  }

  const t = (key: string): string => {
    return translations[key]?.[language] || key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
