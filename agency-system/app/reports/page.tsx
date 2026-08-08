'use client'

import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  FolderKanban,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Share2,
  Calendar,
  Target,
  Award,
  AlertCircle,
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

const monthlyRevenue = [
  { month: 'يناير', value: 45000 },
  { month: 'فبراير', value: 52000 },
  { month: 'مارس', value: 48000 },
  { month: 'أبريل', value: 61000 },
  { month: 'مايو', value: 55000 },
  { month: 'يونيو', value: 67000 },
  { month: 'يوليو', value: 72000 },
  { month: 'أغسطس', value: 68000 },
  { month: 'سبتمبر', value: 75000 },
  { month: 'أكتوبر', value: 82000 },
  { month: 'نوفمبر', value: 78000 },
  { month: 'ديسمبر', value: 85000 },
]

const projectStatus = [
  { status: 'مكتمل', count: 15, percentage: 45, color: 'bg-green-500' },
  { status: 'جاري', count: 12, percentage: 36, color: 'bg-blue-500' },
  { status: 'مراجعة', count: 4, percentage: 12, color: 'bg-accent' },
  { status: 'متأخر', count: 2, percentage: 6, color: 'bg-yellow-500' },
]

const topClients = [
  { name: 'مجموعة XYZ', projects: 5, revenue: '285,000 جنيه', growth: '+12%' },
  { name: 'شركة العز العالمية', projects: 3, revenue: '167,000 جنيه', growth: '+8%' },
  { name: 'شركة ABC', projects: 2, revenue: '125,000 جنيه', growth: '+15%' },
  { name: 'شركة DEF', projects: 1, revenue: '65,000 جنيه', growth: '+5%' },
  { name: 'مجموعة JKL', projects: 1, revenue: '25,000 جنيه', growth: '0%' },
]

const serviceTypes = [
  { name: 'بروفايل مؤسسي', count: 8, percentage: 35, color: 'bg-accent' },
  { name: 'موقع إلكتروني', count: 6, percentage: 26, color: 'bg-blue-500' },
  { name: 'هوية بصرية', count: 5, percentage: 22, color: 'bg-purple-500' },
  { name: 'حملة إعلانية', count: 3, percentage: 13, color: 'bg-green-500' },
  { name: 'مطبوعات', count: 1, percentage: 4, color: 'bg-yellow-500' },
]

export default function ReportsPage() {
  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.value))

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
                  REPORTS / 007
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                REPORTS<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                تحليلات شاملة لأداء وكالتك — إيرادات، مشاريع، عملاء، وإنتاجية.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <Calendar className="h-4 w-4" />
              </button>
              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <Download className="h-4 w-4" />
              </button>
              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* KEY METRICS */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'الإيرادات السنوية', value: '853K', change: '+18%', trending: 'up', icon: DollarSign },
            { label: 'المشاريع المكتملة', value: '15', change: '+5', trending: 'up', icon: CheckCircle2 },
            { label: 'العملاء النشطين', value: '18', change: '+3', trending: 'up', icon: Users },
            { label: 'متوسط قيمة المشروع', value: '45K', change: '+8%', trending: 'up', icon: Target },
          ].map((metric, index) => {
            const Icon = metric.icon
            return (
              <TechCard key={index} className="p-5">
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <Icon className="h-5 w-5 text-text-tertiary" strokeWidth={1.5} />
                    <span className="font-mono-tech text-[10px]">0{index + 1}</span>
                  </div>

                  <div className="font-display text-[48px] text-fg leading-none mb-1">
                    {metric.value}
                  </div>

                  <div className="font-mono-tech text-[10px] text-text-secondary mb-3">
                    {metric.label}
                  </div>

                  <div className="flex items-center gap-1.5 pt-3 border-t border-border">
                    {metric.trending === 'up' ? (
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-accent" />
                    )}
                    <span className={`text-xs font-medium ${metric.trending === 'up' ? 'text-green-500' : 'text-accent'}`}>
                      {metric.change}
                    </span>
                    <span className="text-[10px] text-text-tertiary">· هذا العام</span>
                  </div>
                </div>
              </TechCard>
            )
          })}
        </section>

        {/* REVENUE CHART */}
        <TechCard className="p-6">
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-[1px] w-6 bg-accent" />
                  <span className="font-mono-tech tracking-widest text-[10px]">
                    REVENUE / 2024
                  </span>
                </div>
                <h2 className="font-display text-[36px] text-fg leading-none">
                  الإيرادات الشهرية<span className="text-text-tertiary">.</span>
                </h2>
              </div>
              <div className="text-left">
                <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                  الإجمالي
                </div>
                <div className="font-display text-[32px] text-accent leading-none">
                  853K
                </div>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="flex items-end justify-between gap-2 h-48">
              {monthlyRevenue.map((month, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col items-center justify-end h-40">
                    <div
                      className="w-full bg-accent rounded-t-[2px] transition-all hover:opacity-80"
                      style={{ height: `${(month.value / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono-tech text-[8px] text-text-tertiary">
                    {month.month}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TechCard>

        {/* TWO COLUMN LAYOUT */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Project Status */}
          <TechCard className="p-6">
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  PROJECTS / STATUS
                </span>
              </div>

              <h3 className="font-display text-[28px] text-fg leading-none mb-6">
                حالة المشاريع<span className="text-text-tertiary">.</span>
              </h3>

              <div className="space-y-4">
                {projectStatus.map((status, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${status.color}`} />
                        <span className="text-sm font-medium text-fg">{status.status}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-display text-lg text-fg">
                          {status.count}
                        </span>
                        <span className="font-mono-tech text-[10px] text-text-tertiary">
                          {status.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full ${status.color} rounded-full`}
                        style={{ width: `${status.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TechCard>

          {/* Service Types */}
          <TechCard className="p-6">
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  SERVICES / BREAKDOWN
                </span>
              </div>

              <h3 className="font-display text-[28px] text-fg leading-none mb-6">
                أنواع الخدمات<span className="text-text-tertiary">.</span>
              </h3>

              <div className="space-y-4">
                {serviceTypes.map((service, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-fg">{service.name}</span>
                      <div className="flex items-center gap-4">
                        <span className="font-display text-lg text-fg">
                          {service.count}
                        </span>
                        <span className="font-mono-tech text-[10px] text-text-tertiary">
                          {service.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full ${service.color} rounded-full`}
                        style={{ width: `${service.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TechCard>
        </div>

        {/* TOP CLIENTS */}
        <TechCard className="p-6">
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-[1px] w-6 bg-accent" />
                  <span className="font-mono-tech tracking-widest text-[10px]">
                    TOP / CLIENTS
                  </span>
                </div>
                <h2 className="font-display text-[36px] text-fg leading-none">
                  أفضل العملاء<span className="text-text-tertiary">.</span>
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              {topClients.map((client, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 border border-border rounded-[4px] hover:bg-surface-raised transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-text-tertiary">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-fg">{client.name}</h4>
                      <p className="font-mono-tech text-[10px] text-text-tertiary">
                        {client.projects} مشاريع
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-left">
                      <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                        الإيرادات
                      </div>
                      <div className="font-mono-tech text-[10px] text-accent">
                        {client.revenue}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium text-green-500">
                        {client.growth}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TechCard>

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                ANNUAL REPORT · 2024 · GENERATED AUTOMATICALLY
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · ANALYTICS ONLINE
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
