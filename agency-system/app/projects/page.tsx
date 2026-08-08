'use client'

import { useState } from 'react'
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'

/* ============================================
   BLUEPRINT BACKGROUND
   ============================================ */

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
      <div
        className="fixed bottom-0 left-0 w-[500px] h-[500px] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse at bottom left, hsl(358 75% 50%), transparent 70%)',
          opacity: 0.04,
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

const projects = [
  {
    id: '001',
    name: 'العز العالمية — بروفايل FM',
    client: 'شركة العز العالمية',
    type: 'بروفايل مؤسسي',
    phase: 'استراتيجية المحتوى',
    phaseNumber: 3,
    progress: 45,
    dueDate: '15 · 12 · 2024',
    status: 'جاري',
    budget: '42,000 جنيه',
    team: 4,
  },
  {
    id: '002',
    name: 'ABC — إعادة تصميم الموقع',
    client: 'شركة ABC للتجارة',
    type: 'موقع إلكتروني',
    phase: 'اتجاه التصميم',
    phaseNumber: 5,
    progress: 75,
    dueDate: '20 · 12 · 2024',
    status: 'مراجعة',
    budget: '85,000 جنيه',
    team: 6,
  },
  {
    id: '003',
    name: 'XYZ — هوية بصرية كاملة',
    client: 'مجموعة XYZ',
    type: 'هوية بصرية',
    phase: 'مراقبة الجودة',
    phaseNumber: 8,
    progress: 90,
    dueDate: '10 · 12 · 2024',
    status: 'مراجعة',
    budget: '120,000 جنيه',
    team: 8,
  },
  {
    id: '004',
    name: 'DEF — حملة تسويقية',
    client: 'شركة DEF',
    type: 'حملة إعلانية',
    phase: 'البحث',
    phaseNumber: 2,
    progress: 25,
    dueDate: '25 · 12 · 2024',
    status: 'جاري',
    budget: '65,000 جنيه',
    team: 5,
  },
  {
    id: '005',
    name: 'GHI — كتالوج منتجات',
    client: 'شركة GHI الصناعية',
    type: 'مطبوعات',
    phase: 'تطوير المحتوى',
    phaseNumber: 4,
    progress: 60,
    dueDate: '30 · 12 · 2024',
    status: 'جاري',
    budget: '38,000 جنيه',
    team: 3,
  },
  {
    id: '006',
    name: 'JKL — بروشور تعريفي',
    client: 'مجموعة JKL',
    type: 'مطبوعات',
    phase: 'التسليم',
    phaseNumber: 9,
    progress: 100,
    dueDate: '05 · 12 · 2024',
    status: 'مكتمل',
    budget: '25,000 جنيه',
    team: 2,
  },
]

const filters = [
  { label: 'الكل', value: 'all', count: 6 },
  { label: 'جاري', value: 'active', count: 3 },
  { label: 'مراجعة', value: 'review', count: 2 },
  { label: 'مكتمل', value: 'completed', count: 1 },
]

const projectTypes = [
  'بروفايل مؤسسي',
  'موقع إلكتروني',
  'هوية بصرية',
  'حملة إعلانية',
  'مطبوعات',
]

/* ============================================
   PAGE
   ============================================ */

export default function ProjectsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string | null>(null)

  const filteredProjects = projects.filter((project) => {
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'active' && project.status === 'جاري') ||
      (activeFilter === 'review' && project.status === 'مراجعة') ||
      (activeFilter === 'completed' && project.status === 'مكتمل')

    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.client.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType = !selectedType || project.type === selectedType

    return matchesFilter && matchesSearch && matchesType
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'جاري':
        return 'bg-green-500'
      case 'مراجعة':
        return 'bg-accent'
      case 'مكتمل':
        return 'bg-blue-500'
      default:
        return 'bg-text-tertiary'
    }
  }

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
                  PROJECTS / 002
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                PROJECTS<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                كل مشاريعك في مكان واحد — تابع التقدم، الإدارة، والتسليم.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <DotGrid />
              <button className="border border-border px-4 py-2 text-xs font-medium text-fg hover:border-accent hover:text-accent transition-colors rounded-[4px] bg-surface flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>مشروع جديد</span>
              </button>
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* STATS */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'إجمالي المشاريع', value: '6', icon: FolderKanban },
            { label: 'جاري الآن', value: '3', icon: Clock },
            { label: 'في المراجعة', value: '2', icon: AlertCircle },
            { label: 'مكتمل', value: '1', icon: CheckCircle2 },
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

        {/* FILTERS & SEARCH */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-6">
            {/* Filters */}
            <div className="flex items-center gap-2">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                  className={`border px-3 py-1.5 text-xs font-medium transition-colors rounded-[4px] flex items-center gap-2 ${
                    activeFilter === filter.value
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-text-secondary hover:border-line-light hover:text-fg bg-surface'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className="font-mono-tech text-[10px]">{filter.count}</span>
                </button>
              ))}
            </div>

            {/* Search & View Mode */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="ابحث في المشاريع..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border border-border bg-surface rounded-[4px] px-3 py-2 pr-9 text-xs text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent w-64"
                />
              </div>

              <div className="flex border border-border rounded-[4px] overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 ${
                    viewMode === 'grid'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-surface text-text-secondary hover:text-fg'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 border-l border-border ${
                    viewMode === 'list'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-surface text-text-secondary hover:text-fg'
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Type Filters */}
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono-tech text-[10px] text-text-tertiary mr-2">النوع:</span>
            {projectTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(selectedType === type ? null : type)}
                className={`border px-2 py-1 text-[10px] font-medium transition-colors rounded-[2px] ${
                  selectedType === type
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-text-tertiary hover:border-line-light hover:text-fg bg-surface'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </section>

        {/* PROJECTS GRID */}
        {viewMode === 'grid' ? (
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <a
                key={project.id}
                href={`/projects/${project.id}`}
                className="block"
              >
                <TechCard className="cursor-pointer group">
                <div className="p-5">
                  {/* Project Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tech text-[10px] text-accent">
                        #{project.id}
                      </span>
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(project.status)}`} />
                    </div>
                    <button className="text-text-tertiary hover:text-fg transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Project Name */}
                  <h3 className="text-base font-bold text-fg mb-2 group-hover:text-accent transition-colors line-clamp-1">
                    {project.name}
                  </h3>

                  {/* Client & Type */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                      {project.client}
                    </span>
                    <span className="text-[10px] text-text-tertiary">·</span>
                    <span className="text-[10px] text-text-tertiary">{project.type}</span>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono-tech text-[10px] text-text-secondary">
                        Phase {String(project.phaseNumber).padStart(2, '0')} · {project.phase}
                      </span>
                      <span className="font-display text-lg text-fg">
                        {project.progress}
                        <span className="text-[10px] text-text-tertiary">%</span>
                      </span>
                    </div>
                    <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-text-tertiary" />
                      <span className="font-mono-tech text-[10px] text-text-tertiary">
                        {project.dueDate}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tech text-[10px] text-accent">
                        {project.budget}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom accent on hover */}
                <div className="absolute bottom-0 right-0 w-full h-[1px] bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </TechCard>
              </a>
            ))}
          </section>
        ) : (
          /* LIST VIEW */
          <section>
          <TechCard className="divide-y divide-border">
            {filteredProjects.map((project) => (
              <a
                key={project.id}
                href={`/projects/${project.id}`}
                className="block"
              >
                <div className="flex items-center justify-between p-5 hover:bg-surface-raised transition-colors cursor-pointer group">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <span className="font-mono-tech text-[10px] text-accent">
                        #{project.id}
                      </span>
                      <h3 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
                        {project.name}
                      </h3>
                      <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                        {project.client}
                      </span>
                      <span className="text-[10px] text-text-tertiary">·</span>
                      <span className="text-[10px] text-text-tertiary">{project.type}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-tertiary font-mono-tech">
                      <span>
                        Phase {String(project.phaseNumber).padStart(2, '0')} · {project.phase}
                      </span>
                      <span className="text-line-light">·</span>
                      <span>DELIVERY {project.dueDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                      <span className="font-display text-lg text-fg w-10 text-left">
                        {project.progress}
                        <span className="text-[10px] text-text-tertiary">%</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${getStatusColor(project.status)}`} />
                      <span className="text-xs font-medium text-text-secondary">
                        {project.status}
                      </span>
                    </div>

                    <span className="font-mono-tech text-[10px] text-accent">
                      {project.budget}
                    </span>

                    <ArrowUpRight className="h-4 w-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </a>
            ))}
            </TechCard>
          </section>
        )}

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                {filteredProjects.length} PROJECTS · BUILT WITH PRECISION
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · TRACKING ALL PROJECTS
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
