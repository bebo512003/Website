'use client'

import {
  ArrowRight,
  Users,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Calendar,
  DollarSign,
  FolderKanban,
  MessageSquare,
  FileText,
  TrendingUp,
  Download,
  Share2,
  MoreVertical,
  CheckCircle2,
  Clock,
  ExternalLink,
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
   CLIENT DATA
   ============================================ */

const clientData = {
  id: '001',
  name: 'شركة العز العالمية',
  nameEn: 'Al Ezz International',
  type: 'Enterprise',
  industry: 'مقاولات',
  status: 'active',
  projects: 3,
  totalValue: '167,000 جنيه',
  contactPerson: 'أحمد محمد',
  contactPosition: 'مدير المشاريع',
  email: 'ahmed@alezz-international.com',
  phone: '+966 55 863 8738',
  location: 'الخبر، السعودية',
  website: 'alezz-international.com',
  firstProject: '01 · 11 · 2024',
  lastInteraction: '15 · 12 · 2024',
  description: 'شركة العز العالمية للتجارة العامة والمقاولات — تأسست عام 1979، من الكويت إلى السعودية. أكثر من 30 عامًا من الخبرة في المشاريع الإنشائية والحكومية والبنية التحتية.',
}

const clientProjects = [
  {
    id: '001',
    name: 'العز العالمية — بروفايل FM',
    type: 'بروفايل مؤسسي',
    status: 'جاري',
    progress: 45,
    dueDate: '15 · 12 · 2024',
    budget: '42,000 جنيه',
  },
  {
    id: '009',
    name: 'العز — موقع إلكتروني',
    type: 'موقع إلكتروني',
    status: 'مكتمل',
    progress: 100,
    dueDate: '30 · 10 · 2024',
    budget: '85,000 جنيه',
  },
  {
    id: '010',
    name: 'العز — هوية بصرية',
    type: 'هوية بصرية',
    status: 'مراجعة',
    progress: 90,
    dueDate: '20 · 11 · 2024',
    budget: '40,000 جنيه',
  },
]

const interactions = [
  {
    id: '001',
    type: 'اجتماع',
    title: 'اجتماع Kick-off — بروفايل FM',
    date: '01 · 11 · 2024',
    notes: 'تم الاتفاق على نطاق المشروع والجدول الزمني',
  },
  {
    id: '002',
    type: 'إيميل',
    title: 'إرسال Discovery Report',
    date: '05 · 11 · 2024',
    notes: 'تم إرسال تقرير الاكتشاف للعميل للمراجعة',
  },
  {
    id: '003',
    type: 'مكالمة',
    title: 'مناقشة استراتيجية المحتوى',
    date: '20 · 11 · 2024',
    notes: 'تم الاتفاق على هيكل البروفايل',
  },
  {
    id: '004',
    type: 'اجتماع',
    title: 'مراجعة Research Report',
    date: '10 · 12 · 2024',
    notes: 'العميل وافق على اتجاه البحث',
  },
  {
    id: '005',
    type: 'إيميل',
    title: 'إرسال Content Strategy',
    date: '15 · 12 · 2024',
    notes: 'تم إرسال استراتيجية المحتوى',
  },
]

const tabs = [
  { id: 'overview', label: 'نظرة عامة', icon: Building2 },
  { id: 'projects', label: 'المشاريع', icon: FolderKanban },
  { id: 'interactions', label: 'التفاعلات', icon: MessageSquare },
  { id: 'files', label: 'الملفات', icon: FileText },
]

/* ============================================
   PAGE
   ============================================ */

export default function ClientDetailPage() {
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
              <span>العملاء</span>
            </button>
            <span className="text-text-tertiary">/</span>
            <span className="font-mono-tech text-[10px] text-accent">
              CLIENT #{clientData.id}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-8 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  CLIENT / DETAIL / 001
                </span>
              </div>

              <h1 className="font-display text-[48px] md:text-[64px] text-fg leading-none tracking-tight mb-3">
                {clientData.name}
                <span className="text-text-tertiary">.</span>
              </h1>
              <p className="text-text-secondary text-sm max-w-2xl">
                {clientData.description}
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
        <section className="grid gap-4 md:grid-cols-3">
          {/* Contact Info */}
          <TechCard className="p-5 md:col-span-2">
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  CONTACT / INFO
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    الشخص المسؤول
                  </div>
                  <div className="text-sm font-semibold text-fg">
                    {clientData.contactPerson}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {clientData.contactPosition}
                  </div>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    البريد الإلكتروني
                  </div>
                  <a href={`mailto:${clientData.email}`} className="text-sm font-semibold text-fg hover:text-accent transition-colors flex items-center gap-2">
                    {clientData.email}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    الهاتف
                  </div>
                  <a href={`tel:${clientData.phone}`} className="text-sm font-semibold text-fg hover:text-accent transition-colors flex items-center gap-2">
                    {clientData.phone}
                    <Phone className="h-3 w-3" />
                  </a>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    الموقع
                  </div>
                  <div className="text-sm font-semibold text-fg flex items-center gap-2">
                    {clientData.location}
                    <MapPin className="h-3 w-3" />
                  </div>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    الموقع الإلكتروني
                  </div>
                  <a href={`https://${clientData.website}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-fg hover:text-accent transition-colors flex items-center gap-2">
                    {clientData.website}
                    <Globe className="h-3 w-3" />
                  </a>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-2">
                    النوع
                  </div>
                  <div className="text-sm font-semibold text-fg">
                    {clientData.type}
                  </div>
                </div>
              </div>
            </div>
          </TechCard>

          {/* Stats */}
          <TechCard className="p-5">
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  STATS
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                    المشاريع
                  </div>
                  <div className="font-display text-[36px] text-fg leading-none">
                    {clientData.projects}
                  </div>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                    القيمة الإجمالية
                  </div>
                  <div className="font-display text-[36px] text-accent leading-none">
                    {clientData.totalValue}
                  </div>
                </div>

                <div>
                  <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                    آخر تفاعل
                  </div>
                  <div className="text-sm font-semibold text-fg">
                    {clientData.lastInteraction}
                  </div>
                </div>
              </div>
            </div>
          </TechCard>
        </section>

        {/* TABS */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border px-4 py-2 text-xs font-medium transition-colors rounded-[4px] ${
                    activeTab === tab.id
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-text-secondary hover:border-line-light hover:text-fg bg-surface'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <TechCard className="divide-y divide-border">
              {clientProjects.map((project) => (
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
                          {project.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-tertiary font-mono-tech">
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

                      <span className="font-mono-tech text-[10px] text-accent">
                        {project.budget}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </TechCard>
          )}

          {/* Interactions Tab */}
          {activeTab === 'interactions' && (
            <TechCard className="divide-y divide-border">
              {interactions.map((interaction) => (
                <div key={interaction.id} className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {interaction.type === 'اجتماع' && <Users className="h-5 w-5 text-accent" />}
                      {interaction.type === 'إيميل' && <Mail className="h-5 w-5 text-blue-500" />}
                      {interaction.type === 'مكالمة' && <Phone className="h-5 w-5 text-green-500" />}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-sm font-semibold text-fg">
                          {interaction.title}
                        </h3>
                        <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                          {interaction.type}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mb-2">
                        {interaction.notes}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-text-tertiary font-mono-tech">
                        <Calendar className="h-3 w-3" />
                        <span>{interaction.date}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </TechCard>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <TechCard className="p-8">
              <div className="text-center">
                <FileText className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
                <h3 className="text-lg font-bold text-fg mb-2">
                  لا توجد ملفات مرفقة
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  ارفع ملفات العميل هنا — عقود، عروض أسعار، مستندات
                </p>
                <button className="border border-accent text-accent px-4 py-2 text-xs font-medium rounded-[4px] hover:bg-accent/10 transition-colors">
                  رفع ملفات
                </button>
              </div>
            </TechCard>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid gap-4 md:grid-cols-2">
              <TechCard className="p-5">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      CLIENT / OVERVIEW
                    </span>
                  </div>

                  <div className="space-y-3 text-sm text-text-secondary">
                    <p>{clientData.description}</p>
                    <p>
                      الشركة متخصصة في المقاولات العامة والتجارة، مع خبرة تمتد لأكثر من 30 عامًا في السوق السعودي والكويتي.
                    </p>
                  </div>
                </div>
              </TechCard>

              <TechCard className="p-5">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      KEY / INFO
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                        أول مشروع
                      </div>
                      <div className="text-sm font-semibold text-fg">
                        {clientData.firstProject}
                      </div>
                    </div>

                    <div>
                      <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                        آخر تفاعل
                      </div>
                      <div className="text-sm font-semibold text-fg">
                        {clientData.lastInteraction}
                      </div>
                    </div>

                    <div>
                      <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                        الحالة
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-semibold text-fg">
                          نشط
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </TechCard>
            </div>
          )}
        </section>

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                CLIENT #{clientData.id} · {clientData.projects} PROJECTS · TRACKING ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · CLIENT DATABASE ONLINE
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
