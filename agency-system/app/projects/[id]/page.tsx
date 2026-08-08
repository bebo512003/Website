'use client'

import {
  ArrowRight,
  FolderKanban,
  Clock,
  CheckCircle2,
  Users,
  Calendar,
  DollarSign,
  FileText,
  Image,
  MessageSquare,
  BarChart3,
  Download,
  Share2,
  MoreVertical,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'

/* ============================================
   BLUEPRINT COMPONENTS
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
   WORKFLOW DATA
   ============================================ */

const workflowPhases = [
  { id: 1, name: 'الاكتشاف', nameEn: 'DISCOVERY', status: 'completed', progress: 100, tasks: 8, completed: 8 },
  { id: 2, name: 'البحث', nameEn: 'RESEARCH', status: 'completed', progress: 100, tasks: 6, completed: 6 },
  { id: 3, name: 'استراتيجية المحتوى', nameEn: 'CONTENT STRATEGY', status: 'active', progress: 60, tasks: 5, completed: 3 },
  { id: 4, name: 'تطوير المحتوى', nameEn: 'CONTENT DEVELOPMENT', status: 'pending', progress: 0, tasks: 4, completed: 0 },
  { id: 5, name: 'اتجاه التصميم', nameEn: 'DESIGN DIRECTION', status: 'pending', progress: 0, tasks: 5, completed: 0 },
  { id: 6, name: 'مراجعة التصميم', nameEn: 'DESIGN REVIEW', status: 'pending', progress: 0, tasks: 3, completed: 0 },
  { id: 7, name: 'التعديلات', nameEn: 'REVISIONS', status: 'pending', progress: 0, tasks: 3, completed: 0 },
  { id: 8, name: 'مراقبة الجودة', nameEn: 'QA', status: 'pending', progress: 0, tasks: 4, completed: 0 },
  { id: 9, name: 'التسليم', nameEn: 'DELIVERY', status: 'pending', progress: 0, tasks: 3, completed: 0 },
  { id: 10, name: 'دراسة الحالة', nameEn: 'CASE STUDY', status: 'pending', progress: 0, tasks: 2, completed: 0 },
]

const projectInfo = {
  id: '001',
  name: 'العز العالمية — بروفايل FM',
  client: 'شركة العز العالمية للتجارة العامة والمقاولات',
  type: 'بروفايل مؤسسي',
  status: 'جاري',
  phase: 'استراتيجية المحتوى',
  phaseNumber: 3,
  progress: 45,
  startDate: '01 · 11 · 2024',
  dueDate: '15 · 12 · 2024',
  budget: '42,000 جنيه',
  team: 4,
  files: 12,
  comments: 23,
  description: 'بروفايل مؤسسي لقسم إدارة المرافق — شركة العز العالمية. الهدف: تقديم احترافي + زيادة المبيعات + جذب عملاء جدد + دعم المناقصات الحكومية.',
}

const tabs = [
  { id: 'overview', label: 'نظرة عامة', icon: FolderKanban },
  { id: 'workflow', label: 'مراحل العمل', icon: BarChart3 },
  { id: 'tasks', label: 'المهام', icon: CheckCircle2 },
  { id: 'files', label: 'الملفات', icon: FileText },
  { id: 'comments', label: 'الملاحظات', icon: MessageSquare },
]

/* ============================================
   PAGE
   ============================================ */

export default function ProjectDetailPage() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="relative min-h-screen blueprint-bg">
      <BlueprintDecorations />

      <div className="relative z-10 p-8 space-y-8">
        {/* HEADER */}
        <header className="relative">
          <div className="flex items-center gap-2 mb-4">
            <button className="flex items-center gap-2 text-text-secondary hover:text-fg transition-colors text-sm">
              <ArrowRight className="h-4 w-4" />
              <span>المشاريع</span>
            </button>
            <span className="text-text-tertiary">/</span>
            <span className="font-mono-tech text-[10px] text-accent">
              PROJECT #{projectInfo.id}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-8 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  PROJECT / DETAIL / 001
                </span>
              </div>

              <h1 className="font-display text-[48px] md:text-[64px] text-fg leading-none tracking-tight mb-3">
                {projectInfo.name.split('—')[0].trim()}
                <span className="text-text-tertiary">.</span>
              </h1>
              <p className="text-text-secondary text-sm max-w-2xl">
                {projectInfo.description}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <Share2 className="h-4 w-4" />
              </button>
              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <Download className="h-4 w-4" />
              </button>
              <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* INFO GRID */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'العميل', value: projectInfo.client, icon: Users },
            { label: 'تاريخ البداية', value: projectInfo.startDate, icon: Calendar },
            { label: 'تاريخ التسليم', value: projectInfo.dueDate, icon: Clock },
            { label: 'الميزانية', value: projectInfo.budget, icon: DollarSign },
          ].map((info, index) => {
            const Icon = info.icon
            return (
              <TechCard key={index} className="p-5">
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <Icon className="h-5 w-5 text-text-tertiary" strokeWidth={1.5} />
                    <span className="font-mono-tech text-[10px]">0{index + 1}</span>
                  </div>

                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    {info.label}
                  </div>

                  <div className="text-sm font-semibold text-fg line-clamp-2">
                    {info.value}
                  </div>
                </div>
              </TechCard>
            )
          })}
        </section>

        {/* OVERALL PROGRESS */}
        <TechCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  OVERALL / PROGRESS
                </span>
              </div>
              <h2 className="font-display text-[36px] text-fg leading-none">
                {projectInfo.progress}<span className="text-text-tertiary text-[24px]">%</span>
              </h2>
            </div>

            <div className="text-left">
              <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                المرحلة الحالية
              </div>
              <div className="text-sm font-bold text-accent">
                Phase {String(projectInfo.phaseNumber).padStart(2, '0')} · {projectInfo.phase}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-2 bg-border rounded-full overflow-hidden">
            <div
              className="absolute top-0 right-0 h-full bg-accent rounded-full transition-all"
              style={{ width: `${projectInfo.progress}%` }}
            />
            {/* Phase markers */}
            {workflowPhases.map((phase) => (
              <div
                key={phase.id}
                className="absolute top-0 h-full w-[1px] bg-line-light"
                style={{ right: `${(phase.id - 1) * 10}%` }}
              />
            ))}
          </div>

          {/* Phase labels */}
          <div className="flex justify-between mt-2">
            {workflowPhases.filter(p => p.id % 2 === 1).map((phase) => (
              <span key={phase.id} className="font-mono-tech text-[8px] text-text-tertiary">
                {phase.nameEn}
              </span>
            ))}
          </div>
        </TechCard>

        {/* WORKFLOW PHASES */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-[1px] w-6 bg-accent" />
            <span className="font-mono-tech tracking-widest text-[10px]">
              WORKFLOW / PHASES
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {workflowPhases.map((phase) => {
              const isCompleted = phase.status === 'completed'
              const isActive = phase.status === 'active'
              const isPending = phase.status === 'pending'

              return (
                <TechCard
                  key={phase.id}
                  className={`p-4 cursor-pointer transition-all ${
                    isActive ? 'border-accent' : ''
                  } ${isCompleted ? 'opacity-60' : ''}`}
                >
                  <div className="relative">
                    {/* Phase number */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-display text-2xl text-fg">
                        {String(phase.id).padStart(2, '0')}
                      </span>
                      {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {isActive && <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />}
                      {isPending && <Clock className="h-4 w-4 text-text-tertiary" />}
                    </div>

                    {/* Phase name */}
                    <div className="font-bold text-sm text-fg mb-1 line-clamp-1">
                      {phase.name}
                    </div>
                    <div className="font-mono-tech text-[8px] text-text-tertiary mb-3">
                      {phase.nameEn}
                    </div>

                    {/* Progress */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono-tech text-[9px] text-text-secondary">
                        {phase.completed}/{phase.tasks} مهام
                      </span>
                      <span className="font-display text-base text-fg">
                        {phase.progress}%
                      </span>
                    </div>

                    <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isCompleted ? 'bg-green-500' : isActive ? 'bg-accent' : 'bg-text-tertiary'
                        }`}
                        style={{ width: `${phase.progress}%` }}
                      />
                    </div>
                  </div>
                </TechCard>
              )
            })}
          </div>
        </section>

        {/* STATS */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'الملفات', value: projectInfo.files, icon: FileText },
            { label: 'الملاحظات', value: projectInfo.comments, icon: MessageSquare },
            { label: 'الفريق', value: projectInfo.team, icon: Users },
            { label: 'الأيام المتبقية', value: '15', icon: Clock },
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

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                PROJECT #{projectInfo.id} · PHASE {String(projectInfo.phaseNumber).padStart(2, '0')} · TRACKING ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · MONITORING PROGRESS
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
