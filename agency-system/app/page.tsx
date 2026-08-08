'use client'

import {
  FolderKanban,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

/* ============================================
   HEADER COMPONENT
   ============================================ */

function DashboardHeader() {
  const { t } = useLanguage()
  return (
    <div className="flex items-end justify-between">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-[1px] w-8 bg-accent" />
          <span className="font-mono-tech tracking-widest text-[10px]">
            DASHBOARD / 001
          </span>
        </div>

        <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
          {t('dashboard.welcome')}<span className="text-text-tertiary">.</span>
        </h1>
        <p className="mt-2 text-text-secondary text-sm max-w-lg">
          {t('dashboard.subtitle')}
        </p>
      </div>

      <div className="hidden md:block">
        <DotGrid />
      </div>
    </div>
  )
}

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
            'radial-gradient(ellipse at top right, hsl(8 100% 30%), transparent 70%)',
          opacity: 0.06,
        }}
      />
      <div
        className="fixed bottom-0 left-0 w-[500px] h-[500px] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse at bottom left, hsl(8 100% 25%), transparent 70%)',
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

const stats = [
  {
    title: 'المشاريع النشطة',
    value: '12',
    change: '+2',
    changeLabel: 'هذا الشهر',
    icon: FolderKanban,
    trending: 'up',
  },
  {
    title: 'العملاء',
    value: '28',
    change: '+5',
    changeLabel: 'هذا الشهر',
    icon: Users,
    trending: 'up',
  },
  {
    title: 'المهام المكتملة',
    value: '142',
    change: '+18',
    changeLabel: 'هذا الأسبوع',
    icon: CheckCircle2,
    trending: 'up',
  },
  {
    title: 'في الانتظار',
    value: '7',
    change: 'موافقات',
    changeLabel: 'عملاء',
    icon: Clock,
    trending: 'down',
  },
]

const recentProjects = [
  {
    name: 'العز العالمية — بروفايل FM',
    client: 'شركة العز العالمية',
    phase: 'Phase 03 · استراتيجية المحتوى',
    progress: 45,
    dueDate: '15 · 12 · 2024',
    status: 'جاري',
  },
  {
    name: 'ABC — إعادة تصميم الموقع',
    client: 'شركة ABC للتجارة',
    phase: 'Phase 05 · اتجاه التصميم',
    progress: 75,
    dueDate: '20 · 12 · 2024',
    status: 'مراجعة',
  },
  {
    name: 'XYZ — هوية بصرية كاملة',
    client: 'مجموعة XYZ',
    phase: 'Phase 08 · مراقبة الجودة',
    progress: 90,
    dueDate: '10 · 12 · 2024',
    status: 'مراجعة',
  },
  {
    name: 'DEF — حملة تسويقية',
    client: 'شركة DEF',
    phase: 'Phase 02 · البحث',
    progress: 25,
    dueDate: '25 · 12 · 2024',
    status: 'جاري',
  },
]

const quickActions = [
  { icon: FolderKanban, title: 'مشروع جديد', desc: 'ابدأ مشروع جديد من الصفر', label: 'NEW / PROJECT' },
  { icon: TrendingUp, title: 'تقرير أداء', desc: 'شوف أداء وكالتك', label: 'VIEW / REPORT' },
  { icon: AlertCircle, title: 'مهام عاجلة', desc: '3 مهام محتاجة اهتمامك', label: 'URGENT / TASKS' },
]

/* ============================================
   PAGE
   ============================================ */

export default function DashboardPage() {
  return (
    <div className="relative min-h-screen blueprint-bg">
      <BlueprintDecorations />

      <div className="relative z-10 p-8 space-y-10">
        {/* HEADER */}
        <header className="relative">
          <DashboardHeader />
        </header>

        {/* STATS */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => {
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

                  <div className="font-mono-tech text-[10px] text-text-secondary mb-3">
                    {stat.title}
                  </div>

                  <div className="flex items-center gap-1.5 pt-3 border-t border-border">
                    {stat.trending === 'up' ? (
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-accent" />
                    )}
                    <span
                      className={`text-xs font-medium ${
                        stat.trending === 'up' ? 'text-green-500' : 'text-accent'
                      }`}
                    >
                      {stat.change}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      · {stat.changeLabel}
                    </span>
                  </div>
                </div>
              </TechCard>
            )
          })}
        </section>

        {/* PROJECTS */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  RECENT / PROJECTS
                </span>
              </div>
              <h2 className="font-display text-[36px] text-fg leading-none">
                PROJECTS<span className="text-text-tertiary">.</span>
              </h2>
            </div>
            <button className="border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:text-fg hover:border-line-light transition-colors rounded-[4px] bg-surface flex items-center gap-2">
              <span>عرض الكل</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          <TechCard className="divide-y divide-border">
            {recentProjects.map((project, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-5 hover:bg-surface-raised transition-colors cursor-pointer group"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="font-mono-tech text-[10px] text-accent">
                      #{String(index + 1).padStart(3, '0')}
                    </span>
                    <h3 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
                      {project.name}
                    </h3>
                    <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                      {project.client}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-tertiary font-mono-tech">
                    <span>{project.phase}</span>
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
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        project.status === 'جاري' ? 'bg-green-500' : 'bg-accent'
                      }`}
                    />
                    <span className="text-xs font-medium text-text-secondary">
                      {project.status}
                    </span>
                  </div>

                  <ArrowUpRight className="h-4 w-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </TechCard>
        </section>

        {/* QUICK ACTIONS */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-[1px] w-6 bg-accent" />
            <span className="font-mono-tech tracking-widest text-[10px]">
              QUICK / ACTIONS
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon
              return (
                <TechCard key={index} className="p-6 cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <Icon className="h-5 w-5 text-text-tertiary group-hover:text-accent transition-colors" strokeWidth={1.5} />
                    <span className="font-mono-tech text-[10px] text-text-tertiary">
                      {action.label}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-fg mb-1 group-hover:text-accent transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-xs text-text-tertiary">{action.desc}</p>
                  <div className="mt-5 h-[1px] w-full bg-line group-hover:bg-accent/30 transition-colors" />
                </TechCard>
              )
            })}
          </div>
        </section>

        {/* FOOTER MARK */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                AGENCY OS · V1.0 · BUILT WITH PRECISION
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · ALL SERVICES RUNNING
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
