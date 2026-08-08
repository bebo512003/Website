'use client'

import { useState } from 'react'
import {
  FileText,
  Layout,
  Mail,
  FileSpreadsheet,
  Presentation,
  Image,
  Search,
  Filter,
  Download,
  Star,
  Eye,
  Copy,
  Clock,
  Zap,
  FolderKanban,
  Users,
  TrendingUp,
} from 'lucide-react'

function BlueprintDecorations() {
  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(hsl(0 0% 12%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 12%) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.3,
        }}
      />
      <div
        className="fixed top-0 right-0 w-[600px] h-[600px] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse at top right, hsl(358 75% 50%), transparent 70%)',
          opacity: 0.06,
        }}
      />
    </>
  )
}

function DotGrid({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-grid grid-cols-3 gap-[3px] ${className}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-line-light" />
      ))}
    </div>
  )
}

function CornerMarker() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-l border-line-light" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-r border-line-light" />
    </div>
  )
}

function TechCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative bg-surface border border-border overflow-hidden ${className}`}>
      <CornerMarker />
      <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-accent/40 via-accent/10 to-transparent" />
      {children}
    </div>
  )
}

/* ============================================
   DATA
   ============================================ */

interface Template {
  id: string
  name: string
  category: string
  type: 'document' | 'design' | 'email' | 'spreadsheet' | 'presentation'
  description: string
  usage: number
  rating: number
  lastUpdated: string
  featured?: boolean
}

const templates: Template[] = [
  {
    id: 'T001',
    name: 'بروفايل مؤسسي — عربي/إنجليزي',
    category: 'بروفايلات',
    type: 'document',
    description: 'قالب بروفايل مؤسسي ثنائي اللغة مع 10 مراحل عمل',
    usage: 45,
    rating: 4.8,
    lastUpdated: '15 · 12 · 2024',
    featured: true,
  },
  {
    id: 'T002',
    name: 'اكتشاف المشروع (Discovery)',
    category: 'اكتشاف',
    type: 'document',
    description: 'نموذج Discovery Report شامل مع 15 سؤال',
    usage: 38,
    rating: 4.7,
    lastUpdated: '10 · 12 · 2024',
    featured: true,
  },
  {
    id: 'T003',
    name: 'تحليل المنافسين',
    category: 'بحث',
    type: 'spreadsheet',
    description: 'قالب Excel لتحليل 10 منافسين مع نقاط قوة/ضعف',
    usage: 32,
    rating: 4.6,
    lastUpdated: '08 · 12 · 2024',
  },
  {
    id: 'T004',
    name: 'استراتيجية المحتوى',
    category: 'محتوى',
    type: 'document',
    description: 'هيكل صفحة بصفحة مع أسباب وجود كل صفحة',
    usage: 28,
    rating: 4.9,
    lastUpdated: '12 · 12 · 2024',
    featured: true,
  },
  {
    id: 'T005',
    name: 'اتجاه التصميم (Design Direction)',
    category: 'تصميم',
    type: 'presentation',
    description: 'عرض تقديمي لاتجاه التصميم مع Moodboard',
    usage: 25,
    rating: 4.5,
    lastUpdated: '05 · 12 · 2024',
  },
  {
    id: 'T006',
    name: 'مراجعة التصميم (QA)',
    category: 'جودة',
    type: 'document',
    description: 'checklist شامل لمراجعة كل عناصر التصميم',
    usage: 22,
    rating: 4.4,
    lastUpdated: '01 · 12 · 2024',
  },
  {
    id: 'T007',
    name: 'إيميل العميل — بدء المشروع',
    category: 'تواصل',
    type: 'email',
    description: 'قالب إيميل احترافي لبدء مشروع جديد',
    usage: 52,
    rating: 4.3,
    lastUpdated: '20 · 11 · 2024',
  },
  {
    id: 'T008',
    name: 'عقد اتفاقية خدمات',
    category: 'قانوني',
    type: 'document',
    description: 'عقد خدمات احترافي مع جميع البنود',
    usage: 18,
    rating: 4.7,
    lastUpdated: '25 · 11 · 2024',
  },
  {
    id: 'T009',
    name: 'فاتورة احترافية',
    category: 'مالي',
    type: 'spreadsheet',
    description: 'قالب فاتورة مع حسابات تلقائية',
    usage: 41,
    rating: 4.6,
    lastUpdated: '18 · 11 · 2024',
  },
  {
    id: 'T010',
    name: 'دراسة حالة (Case Study)',
    category: 'تسويق',
    type: 'document',
    description: 'هيكل دراسة حالة مع قبل/بعد ودروس مستفادة',
    usage: 15,
    rating: 4.8,
    lastUpdated: '28 · 11 · 2024',
  },
  {
    id: 'T011',
    name: 'مخطط زمني للمشروع',
    category: 'إدارة',
    type: 'spreadsheet',
    description: 'Gantt Chart مع 10 مراحل وtracking تلقائي',
    usage: 35,
    rating: 4.5,
    lastUpdated: '10 · 11 · 2024',
  },
  {
    id: 'T012',
    name: 'Brief إبداعي',
    category: 'إبداع',
    type: 'document',
    description: 'نموذج brief شامل للمصممين والمطورين',
    usage: 29,
    rating: 4.4,
    lastUpdated: '15 · 11 · 2024',
  },
]

const categories = [
  { label: 'الكل', value: 'all', count: 12 },
  { label: 'بروفايلات', value: 'بروفايلات', count: 1 },
  { label: 'اكتشاف', value: 'اكتشاف', count: 1 },
  { label: 'بحث', value: 'بحث', count: 1 },
  { label: 'محتوى', value: 'محتوى', count: 1 },
  { label: 'تصميم', value: 'تصميم', count: 1 },
  { label: 'جودة', value: 'جودة', count: 1 },
  { label: 'تواصل', value: 'تواصل', count: 1 },
  { label: 'قانوني', value: 'قانوني', count: 1 },
  { label: 'مالي', value: 'مالي', count: 1 },
  { label: 'تسويق', value: 'تسويق', count: 1 },
  { label: 'إدارة', value: 'إدارة', count: 1 },
  { label: 'إبداع', value: 'إبداع', count: 1 },
]

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTemplates = templates.filter((template) => {
    const matchesCategory =
      activeCategory === 'all' || template.category === activeCategory

    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesCategory && matchesSearch
  })

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document':
        return FileText
      case 'design':
        return Layout
      case 'email':
        return Mail
      case 'spreadsheet':
        return FileSpreadsheet
      case 'presentation':
        return Presentation
      default:
        return FileText
    }
  }

  const totalTemplates = templates.length
  const totalUsage = templates.reduce((sum, t) => sum + t.usage, 0)
  const avgRating = (templates.reduce((sum, t) => sum + t.rating, 0) / templates.length).toFixed(1)
  const featuredCount = templates.filter((t) => t.featured).length

  return (
    <div className="relative min-h-screen blueprint-bg">
      <BlueprintDecorations />

      <div className="relative z-10 p-8 space-y-8">
        {/* HEADER */}
        <header className="relative">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-8 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  TEMPLATES / 008
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                TEMPLATES<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                مكتبة القوالب الجاهزة — وفّر وقتك وابدأ بسرعة مع قوالب احترافية.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <DotGrid />
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* STATS */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'إجمالي القوالب', value: totalTemplates.toString(), icon: FileText },
            { label: 'الاستخدام الكلي', value: totalUsage.toString(), icon: TrendingUp },
            { label: 'متوسط التقييم', value: avgRating, icon: Star },
            { label: 'مميزة', value: featuredCount.toString(), icon: Zap },
          ].map((stat, index) => {
            const Icon = stat.icon
            return (
              <TechCard key={index} className="p-5">
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <Icon className="h-5 w-5 text-text-tertiary" strokeWidth={1.5} />
                    <span className="font-mono-tech text-[10px]">0{index + 1}</span>
                  </div>

                  <div className="font-display text-[48px] text-fg leading-none mb-1">
                    {stat.value}
                  </div>

                  <div className="font-mono-tech text-[10px] text-text-secondary">
                    {stat.label}
                  </div>
                </div>
              </TechCard>
            )
          })}
        </section>

        {/* SEARCH & FILTERS */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              {categories.slice(0, 8).map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={`border px-3 py-1.5 text-xs font-medium transition-colors rounded-[4px] ${
                    activeCategory === cat.value
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-text-secondary hover:border-line-light hover:text-fg bg-surface'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="ابحث في القوالب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border border-border bg-surface rounded-[4px] px-3 py-2 pr-9 text-xs text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent w-64"
              />
            </div>
          </div>
        </section>

        {/* TEMPLATES GRID */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => {
            const Icon = getTypeIcon(template.type)
            return (
              <TechCard key={template.id} className="cursor-pointer group">
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Icon className="h-6 w-6 text-text-tertiary" strokeWidth={1.5} />
                      <span className="font-mono-tech text-[10px] text-accent">
                        {template.id}
                      </span>
                    </div>
                    {template.featured && (
                      <Zap className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-base font-bold text-fg mb-2 group-hover:text-accent transition-colors line-clamp-1">
                    {template.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-text-secondary mb-4 line-clamp-2">
                    {template.description}
                  </p>

                  {/* Category */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                      {template.category}
                    </span>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3 text-text-tertiary" />
                      <span className="font-mono-tech text-[10px] text-text-tertiary">
                        {template.usage} استخدام
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <span className="font-mono-tech text-[10px] text-text-tertiary">
                        {template.rating}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    <button className="flex-1 border border-border bg-surface-raised rounded-[4px] px-3 py-1.5 text-[10px] font-medium text-text-secondary hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-1">
                      <Eye className="h-3 w-3" />
                      <span>معاينة</span>
                    </button>
                    <button className="flex-1 border border-border bg-surface-raised rounded-[4px] px-3 py-1.5 text-[10px] font-medium text-text-secondary hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-1">
                      <Download className="h-3 w-3" />
                      <span>تحميل</span>
                    </button>
                    <button className="flex-1 border border-accent bg-accent/10 rounded-[4px] px-3 py-1.5 text-[10px] font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-center gap-1">
                      <Copy className="h-3 w-3" />
                      <span>استخدام</span>
                    </button>
                  </div>
                </div>

                {/* Bottom accent on hover */}
                <div className="absolute bottom-0 right-0 w-full h-[1px] bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </TechCard>
            )
          })}
        </section>

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                {filteredTemplates.length} TEMPLATES · LIBRARY UPDATED
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · TEMPLATE LIBRARY ONLINE
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
