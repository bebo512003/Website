'use client'

import { useState } from 'react'
import {
  Users,
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Calendar,
  DollarSign,
  FolderKanban,
  TrendingUp,
  UserPlus,
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

const clients = [
  {
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
  },
  {
    id: '002',
    name: 'شركة ABC للتجارة',
    nameEn: 'ABC Trading Co.',
    type: 'Enterprise',
    industry: 'تجارة',
    status: 'active',
    projects: 2,
    totalValue: '125,000 جنيه',
    contactPerson: 'محمد علي',
    contactPosition: 'مدير التسويق',
    email: 'mohamed@abc.com',
    phone: '+966 50 123 4567',
    location: 'الرياض، السعودية',
    website: 'abc.com',
    firstProject: '15 · 09 · 2024',
    lastInteraction: '10 · 12 · 2024',
  },
  {
    id: '003',
    name: 'مجموعة XYZ',
    nameEn: 'XYZ Group',
    type: 'Enterprise',
    industry: 'استثمار',
    status: 'review',
    projects: 1,
    totalValue: '120,000 جنيه',
    contactPerson: 'سارة أحمد',
    contactPosition: 'مدير العمليات',
    email: 'sara@xyz.com',
    phone: '+966 55 987 6543',
    location: 'جدة، السعودية',
    website: 'xyz.com',
    firstProject: '20 · 10 · 2024',
    lastInteraction: '05 · 12 · 2024',
  },
  {
    id: '004',
    name: 'شركة DEF',
    nameEn: 'DEF Company',
    type: 'SMB',
    industry: 'تسويق',
    status: 'active',
    projects: 1,
    totalValue: '65,000 جنيه',
    contactPerson: 'خالد محمود',
    contactPosition: 'المدير التنفيذي',
    email: 'khaled@def.com',
    phone: '+966 54 321 9876',
    location: 'الدمام، السعودية',
    website: 'def.com',
    firstProject: '01 · 11 · 2024',
    lastInteraction: '12 · 12 · 2024',
  },
  {
    id: '005',
    name: 'شركة GHI الصناعية',
    nameEn: 'GHI Industrial',
    type: 'SMB',
    industry: 'صناعة',
    status: 'active',
    projects: 1,
    totalValue: '38,000 جنيه',
    contactPerson: 'عمر حسن',
    contactPosition: 'مدير المشتريات',
    email: 'omar@ghi.com',
    phone: '+966 56 789 0123',
    location: 'ينبع، السعودية',
    website: 'ghi.com',
    firstProject: '10 · 11 · 2024',
    lastInteraction: '08 · 12 · 2024',
  },
  {
    id: '006',
    name: 'مجموعة JKL',
    nameEn: 'JKL Group',
    type: 'SMB',
    industry: 'عقارات',
    status: 'completed',
    projects: 1,
    totalValue: '25,000 جنيه',
    contactPerson: 'فاطمة عبدالله',
    contactPosition: 'مدير العلاقات',
    email: 'fatma@jkl.com',
    phone: '+966 53 456 7890',
    location: 'مكة، السعودية',
    website: 'jkl.com',
    firstProject: '01 · 10 · 2024',
    lastInteraction: '05 · 12 · 2024',
  },
  {
    id: '007',
    name: 'شركة MNO التقنية',
    nameEn: 'MNO Tech',
    type: 'SMB',
    industry: 'تكنولوجيا',
    status: 'potential',
    projects: 0,
    totalValue: '0 جنيه',
    contactPerson: 'يوسف إبراهيم',
    contactPosition: 'مؤسس',
    email: 'youssef@mno.com',
    phone: '+966 57 234 5678',
    location: 'الخبر، السعودية',
    website: 'mno.com',
    firstProject: '-',
    lastInteraction: '20 · 12 · 2024',
  },
  {
    id: '008',
    name: 'مؤسسة PQR',
    nameEn: 'PQR Foundation',
    type: 'Individual',
    industry: 'تعليم',
    status: 'potential',
    projects: 0,
    totalValue: '0 جنيه',
    contactPerson: 'نورا سعيد',
    contactPosition: 'مدير',
    email: 'noura@pqr.com',
    phone: '+966 58 876 5432',
    location: 'الطائف، السعودية',
    website: 'pqr.com',
    firstProject: '-',
    lastInteraction: '18 · 12 · 2024',
  },
]

const clientTypes = [
  { label: 'الكل', value: 'all', count: 8 },
  { label: 'Enterprise', value: 'enterprise', count: 3 },
  { label: 'SMB', value: 'smb', count: 3 },
  { label: 'Individual', value: 'individual', count: 1 },
  { label: 'محتمل', value: 'potential', count: 2 },
]

const industries = [
  'مقاولات',
  'تجارة',
  'استثمار',
  'تسويق',
  'صناعة',
  'عقارات',
  'تكنولوجيا',
  'تعليم',
]

/* ============================================
   PAGE
   ============================================ */

export default function ClientsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)

  const filteredClients = clients.filter((client) => {
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'enterprise' && client.type === 'Enterprise') ||
      (activeFilter === 'smb' && client.type === 'SMB') ||
      (activeFilter === 'individual' && client.type === 'Individual') ||
      (activeFilter === 'potential' && client.status === 'potential')

    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.contactPerson.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesIndustry = !selectedIndustry || client.industry === selectedIndustry

    return matchesFilter && matchesSearch && matchesIndustry
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'review':
        return 'bg-accent'
      case 'completed':
        return 'bg-blue-500'
      case 'potential':
        return 'bg-yellow-500'
      default:
        return 'bg-text-tertiary'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'نشط'
      case 'review':
        return 'مراجعة'
      case 'completed':
        return 'مكتمل'
      case 'potential':
        return 'محتمل'
      default:
        return status
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
                  CLIENTS / 003
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                CLIENTS<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                قاعدة بيانات عملائك — كل المعلومات، كل المشاريع، كل التفاعلات في مكان واحد.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <DotGrid />
              <button className="border border-border px-4 py-2 text-xs font-medium text-fg hover:border-accent hover:text-accent transition-colors rounded-[4px] bg-surface flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                <span>عميل جديد</span>
              </button>
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* STATS */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'إجمالي العملاء', value: '8', icon: Users },
            { label: 'عملاء نشطين', value: '5', icon: CheckCircle2 },
            { label: 'عملاء محتملين', value: '2', icon: UserPlus },
            { label: 'إجمالي القيمة', value: '540K', icon: DollarSign },
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
              {clientTypes.map((filter) => (
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
                  placeholder="ابحث عن عميل..."
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

          {/* Industry Filters */}
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono-tech text-[10px] text-text-tertiary mr-2">الصناعة:</span>
            {industries.map((industry) => (
              <button
                key={industry}
                onClick={() => setSelectedIndustry(selectedIndustry === industry ? null : industry)}
                className={`border px-2 py-1 text-[10px] font-medium transition-colors rounded-[2px] ${
                  selectedIndustry === industry
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-text-tertiary hover:border-line-light hover:text-fg bg-surface'
                }`}
              >
                {industry}
              </button>
            ))}
          </div>
        </section>

        {/* CLIENTS GRID */}
        {viewMode === 'grid' ? (
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {filteredClients.map((client) => (
              <a
                key={client.id}
                href={`/clients/${client.id}`}
                className="block"
              >
                <TechCard className="cursor-pointer group">
                  <div className="p-5">
                    {/* Client Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech text-[10px] text-accent">
                          #{client.id}
                        </span>
                        <div className={`h-2 w-2 rounded-full ${getStatusColor(client.status)}`} />
                      </div>
                      <button className="text-text-tertiary hover:text-fg transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Client Name */}
                    <h3 className="text-base font-bold text-fg mb-1 group-hover:text-accent transition-colors line-clamp-1">
                      {client.name}
                    </h3>
                    <p className="font-mono-tech text-[10px] text-text-tertiary mb-4">
                      {client.nameEn}
                    </p>

                    {/* Type & Industry */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                        {client.type}
                      </span>
                      <span className="text-[10px] text-text-tertiary">·</span>
                      <span className="text-[10px] text-text-tertiary">{client.industry}</span>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Users className="h-3 w-3" />
                        <span className="truncate">{client.contactPerson}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{client.location}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-3 w-3 text-text-tertiary" />
                        <span className="font-mono-tech text-[10px] text-text-tertiary">
                          {client.projects} مشاريع
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3 w-3 text-text-tertiary" />
                        <span className="font-mono-tech text-[10px] text-accent">
                          {client.totalValue}
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
              {filteredClients.map((client) => (
                <a
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-5 hover:bg-surface-raised transition-colors cursor-pointer group">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <span className="font-mono-tech text-[10px] text-accent">
                          #{client.id}
                        </span>
                        <h3 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
                          {client.name}
                        </h3>
                        <span className="border border-border px-2 py-0.5 text-[10px] font-mono-tech text-text-tertiary rounded-[2px]">
                          {client.nameEn}
                        </span>
                        <div className={`h-2 w-2 rounded-full ${getStatusColor(client.status)}`} />
                        <span className="text-[10px] text-text-secondary">
                          {getStatusLabel(client.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-tertiary font-mono-tech">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {client.contactPerson}
                        </span>
                        <span className="text-line-light">·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {client.location}
                        </span>
                        <span className="text-line-light">·</span>
                        <span>{client.industry}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-left">
                        <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                          المشاريع
                        </div>
                        <div className="font-display text-lg text-fg">
                          {client.projects}
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="font-mono-tech text-[10px] text-text-secondary mb-1">
                          القيمة
                        </div>
                        <div className="font-mono-tech text-[10px] text-accent">
                          {client.totalValue}
                        </div>
                      </div>

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
                {filteredClients.length} CLIENTS · DATABASE ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · TRACKING ALL CLIENTS
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
