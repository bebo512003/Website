'use client'

import { useState } from 'react'
import {
  Upload,
  FileText,
  Image,
  File,
  Folder,
  Search,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  Download,
  Trash2,
  Eye,
  Calendar,
  HardDrive,
  Clock,
  Star,
  Share2,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  Film,
} from 'lucide-react'

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

function TechCard({ children, className = '', ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={`relative bg-surface border border-border overflow-hidden ${className}`}
      {...props}
    >
      <CornerMarker />
      <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-accent/40 via-accent/10 to-transparent" />
      {children}
    </div>
  )
}

/* ============================================
   TYPES
   ============================================ */

interface FileItem {
  id: string
  name: string
  type: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'video'
  size: string
  project: string
  projectId: string
  uploadedBy: string
  uploadDate: string
  starred: boolean
  thumbnail?: string
}

/* ============================================
   DATA
   ============================================ */

const initialFiles: FileItem[] = [
  {
    id: 'F001',
    name: 'Discovery Report — Al Ezz FM.pdf',
    type: 'pdf',
    size: '2.4 MB',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    uploadedBy: 'أحمد محمد',
    uploadDate: '05 · 11 · 2024',
    starred: true,
  },
  {
    id: 'F002',
    name: 'Research Report — Competitors.pdf',
    type: 'pdf',
    size: '5.1 MB',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    uploadedBy: 'أحمد محمد',
    uploadDate: '15 · 11 · 2024',
    starred: false,
  },
  {
    id: 'F003',
    name: 'Content Strategy — Outline.docx',
    type: 'document',
    size: '856 KB',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    uploadedBy: 'سارة أحمد',
    uploadDate: '20 · 11 · 2024',
    starred: true,
  },
  {
    id: 'F004',
    name: 'Project Photos — Batch 1.zip',
    type: 'archive',
    size: '45.2 MB',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    uploadedBy: 'فاطمة عبدالله',
    uploadDate: '25 · 11 · 2024',
    starred: false,
  },
  {
    id: 'F005',
    name: 'Logo Concepts — v1.png',
    type: 'image',
    size: '3.8 MB',
    project: 'XYZ — هوية بصرية كاملة',
    projectId: '003',
    uploadedBy: 'محمد علي',
    uploadDate: '01 · 12 · 2024',
    starred: true,
  },
  {
    id: 'F006',
    name: 'Logo Concepts — v2.png',
    type: 'image',
    size: '4.2 MB',
    project: 'XYZ — هوية بصرية كاملة',
    projectId: '003',
    uploadedBy: 'محمد علي',
    uploadDate: '01 · 12 · 2024',
    starred: false,
  },
  {
    id: 'F007',
    name: 'Wireframes — Homepage.pdf',
    type: 'pdf',
    size: '1.9 MB',
    project: 'ABC — إعادة تصميم الموقع',
    projectId: '002',
    uploadedBy: 'محمد علي',
    uploadDate: '10 · 12 · 2024',
    starred: false,
  },
  {
    id: 'F008',
    name: 'Budget Tracker — Q4.xlsx',
    type: 'spreadsheet',
    size: '428 KB',
    project: 'DEF — حملة تسويقية',
    projectId: '004',
    uploadedBy: 'خالد محمود',
    uploadDate: '12 · 12 · 2024',
    starred: false,
  },
  {
    id: 'F009',
    name: 'Campaign Video — Draft.mp4',
    type: 'video',
    size: '128 MB',
    project: 'DEF — حملة تسويقية',
    projectId: '004',
    uploadedBy: 'سارة أحمد',
    uploadDate: '14 · 12 · 2024',
    starred: true,
  },
  {
    id: 'F010',
    name: 'Client Meeting — Notes.docx',
    type: 'document',
    size: '156 KB',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    uploadedBy: 'أحمد محمد',
    uploadDate: '15 · 12 · 2024',
    starred: false,
  },
]

const fileTypes = [
  { label: 'الكل', value: 'all', count: 10 },
  { label: 'PDF', value: 'pdf', count: 3 },
  { label: 'صور', value: 'image', count: 2 },
  { label: 'مستندات', value: 'document', count: 2 },
  { label: 'جداول', value: 'spreadsheet', count: 1 },
  { label: 'أرشيف', value: 'archive', count: 1 },
  { label: 'فيديو', value: 'video', count: 1 },
]

const projects = [
  'العز العالمية — بروفايل FM',
  'ABC — إعادة تصميم الموقع',
  'XYZ — هوية بصرية كاملة',
  'DEF — حملة تسويقية',
]

/* ============================================
   PAGE
   ============================================ */

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>(initialFiles)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const filteredFiles = files.filter((file) => {
    const matchesFilter =
      activeFilter === 'all' || file.type === activeFilter

    const matchesSearch =
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.project.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesProject = !selectedProject || file.project === selectedProject

    return matchesFilter && matchesSearch && matchesProject
  })

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return FileText
      case 'image':
        return FileImage
      case 'document':
        return FileText
      case 'spreadsheet':
        return FileSpreadsheet
      case 'archive':
        return FileArchive
      case 'video':
        return Film
      default:
        return File
    }
  }

  const getFileColor = (type: string) => {
    switch (type) {
      case 'pdf':
        return 'text-red-500'
      case 'image':
        return 'text-blue-500'
      case 'document':
        return 'text-green-500'
      case 'spreadsheet':
        return 'text-yellow-500'
      case 'archive':
        return 'text-purple-500'
      case 'video':
        return 'text-pink-500'
      default:
        return 'text-text-tertiary'
    }
  }

  const toggleStar = (fileId: string) => {
    setFiles(files.map((file) =>
      file.id === fileId ? { ...file, starred: !file.starred } : file
    ))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    // Handle file upload here
    console.log('Files dropped:', e.dataTransfer.files)
  }

  const totalSize = '192 MB'
  const totalFiles = files.length
  const starredFiles = files.filter((f) => f.starred).length
  const recentFiles = 3

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
                  FILES / 005
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                FILES<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                نظام إدارة الملفات — ارفع، نظم، وشارك ملفاتك مع فريقك.
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
            { label: 'إجمالي الملفات', value: totalFiles.toString(), icon: HardDrive },
            { label: 'الحجم الكلي', value: totalSize, icon: File },
            { label: 'مميزة', value: starredFiles.toString(), icon: Star },
            { label: 'هذا الأسبوع', value: recentFiles.toString(), icon: Clock },
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

        {/* UPLOAD ZONE */}
        <TechCard
          className={`p-8 transition-colors ${
            dragActive ? 'border-accent bg-accent/5' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="relative text-center">
            <div className="flex flex-col items-center justify-center">
              <Upload className="h-12 w-12 text-text-tertiary mb-4" strokeWidth={1.5} />
              <h3 className="text-lg font-bold text-fg mb-2">
                اسحب الملفات هنا للرفع
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                أو اضغط لاختيار ملفات من جهازك
              </p>
              <button className="border border-accent text-accent px-6 py-2 text-xs font-medium rounded-[4px] hover:bg-accent/10 transition-colors">
                اختر ملفات
              </button>
              <p className="font-mono-tech text-[9px] text-text-tertiary mt-4">
                الحد الأقصى: 50 MB لكل ملف · PDF, DOCX, XLSX, PNG, JPG, ZIP
              </p>
            </div>
          </div>
        </TechCard>

        {/* FILTERS & SEARCH */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-6">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {fileTypes.map((filter) => (
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
                  placeholder="ابحث في الملفات..."
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

          {/* Project Filters */}
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono-tech text-[10px] text-text-tertiary mr-2">المشروع:</span>
            {projects.map((project) => (
              <button
                key={project}
                onClick={() => setSelectedProject(selectedProject === project ? null : project)}
                className={`border px-2 py-1 text-[10px] font-medium transition-colors rounded-[2px] ${
                  selectedProject === project
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-text-tertiary hover:border-line-light hover:text-fg bg-surface'
                }`}
              >
                {project.split('—')[0].trim()}
              </button>
            ))}
          </div>
        </section>

        {/* FILES GRID */}
        {viewMode === 'grid' ? (
          <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filteredFiles.map((file) => {
              const Icon = getFileIcon(file.type)
              const color = getFileColor(file.type)
              return (
                <TechCard key={file.id} className="cursor-pointer group">
                  <div className="p-5">
                    {/* File Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`flex-shrink-0 ${color}`}>
                        <Icon className="h-8 w-8" strokeWidth={1.5} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleStar(file.id)}
                          className="p-1 rounded hover:bg-surface-raised transition-colors"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              file.starred
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-text-tertiary'
                            }`}
                          />
                        </button>
                        <button className="p-1 rounded hover:bg-surface-raised transition-colors">
                          <MoreVertical className="h-4 w-4 text-text-tertiary" />
                        </button>
                      </div>
                    </div>

                    {/* File Name */}
                    <h3 className="text-sm font-bold text-fg mb-2 group-hover:text-accent transition-colors line-clamp-2">
                      {file.name}
                    </h3>

                    {/* Project */}
                    <div className="flex items-center gap-2 mb-4">
                      <Folder className="h-3 w-3 text-text-tertiary" />
                      <span className="text-[10px] text-text-secondary truncate">
                        {file.project}
                      </span>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-3 w-3 text-text-tertiary" />
                        <span className="font-mono-tech text-[10px] text-text-tertiary">
                          {file.size}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-text-tertiary" />
                        <span className="font-mono-tech text-[10px] text-text-tertiary">
                          {file.uploadDate}
                        </span>
                      </div>
                    </div>

                    {/* Actions on hover */}
                    <div className="absolute bottom-0 right-0 w-full h-[1px] bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </TechCard>
              )
            })}
          </section>
        ) : (
          /* LIST VIEW */
          <section>
            <TechCard className="divide-y divide-border">
              {filteredFiles.map((file) => {
                const Icon = getFileIcon(file.type)
                const color = getFileColor(file.type)
                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-5 hover:bg-surface-raised transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`flex-shrink-0 ${color}`}>
                        <Icon className="h-6 w-6" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
                            {file.name}
                          </h3>
                          {file.starred && (
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-tertiary font-mono-tech">
                          <span className="flex items-center gap-1">
                            <Folder className="h-3 w-3" />
                            {file.project}
                          </span>
                          <span className="text-line-light">·</span>
                          <span>{file.size}</span>
                          <span className="text-line-light">·</span>
                          <span>{file.uploadDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button className="p-2 rounded-[4px] border border-border bg-surface text-text-secondary hover:text-fg transition-colors">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="p-2 rounded-[4px] border border-border bg-surface text-text-secondary hover:text-fg transition-colors">
                        <Download className="h-4 w-4" />
                      </button>
                      <button className="p-2 rounded-[4px] border border-border bg-surface text-text-secondary hover:text-fg transition-colors">
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button className="p-2 rounded-[4px] border border-border bg-surface text-text-secondary hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
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
                {filteredFiles.length} FILES · {totalSize} STORAGE USED
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · FILE STORAGE ONLINE
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
