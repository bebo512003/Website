'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Calendar,
  Users,
  Flag,
  GripVertical,
  Tag,
  FolderKanban,
  TrendingUp,
  MessageSquare,
  Paperclip,
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
   TYPES
   ============================================ */

interface Task {
  id: string
  title: string
  project: string
  projectId: string
  assignee: string
  priority: 'high' | 'medium' | 'low'
  dueDate: string
  tags: string[]
  comments: number
  attachments: number
  description: string
}

/* ============================================
   DATA
   ============================================ */

const initialTasks: Task[] = [
  {
    id: 'T001',
    title: 'كتابة محتوى صفحة الرؤية والرسالة',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    assignee: 'أحمد محمد',
    priority: 'high',
    dueDate: '18 · 12 · 2024',
    tags: ['محتوى', 'عربي'],
    comments: 3,
    attachments: 1,
    description: 'كتابة نص احترافي للرؤية والرسالة باللغة العربية',
  },
  {
    id: 'T002',
    title: 'ترجمة المحتوى للإنجليزية',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    assignee: 'سارة أحمد',
    priority: 'high',
    dueDate: '20 · 12 · 2024',
    tags: ['ترجمة', 'إنجليزي'],
    comments: 1,
    attachments: 0,
    description: 'ترجمة كل المحتوى العربي للإنجليزية باحترافية',
  },
  {
    id: 'T003',
    title: 'تصميم هيكل البروفايل',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    assignee: 'محمد علي',
    priority: 'medium',
    dueDate: '22 · 12 · 2024',
    tags: ['تصميم', 'UI'],
    comments: 5,
    attachments: 2,
    description: 'تصميم wireframes للصفحات الرئيسية',
  },
  {
    id: 'T004',
    title: 'جمع صور المشاريع',
    project: 'العز العالمية — بروفايل FM',
    projectId: '001',
    assignee: 'فاطمة عبدالله',
    priority: 'medium',
    dueDate: '15 · 12 · 2024',
    tags: ['محتوى', 'صور'],
    comments: 2,
    attachments: 8,
    description: 'جمع وتنظيم صور المشاريع من العميل',
  },
  {
    id: 'T005',
    title: 'مراجعة SEO للموقع',
    project: 'ABC — إعادة تصميم الموقع',
    projectId: '002',
    assignee: 'خالد محمود',
    priority: 'low',
    dueDate: '25 · 12 · 2024',
    tags: ['SEO', 'تقني'],
    comments: 0,
    attachments: 0,
    description: 'مراجعة وتحسين عناصر SEO',
  },
  {
    id: 'T006',
    title: 'اختبار Responsive Design',
    project: 'ABC — إعادة تصميم الموقع',
    projectId: '002',
    assignee: 'محمد علي',
    priority: 'high',
    dueDate: '19 · 12 · 2024',
    tags: ['تصميم', 'اختبار'],
    comments: 4,
    attachments: 1,
    description: 'اختبار الموقع على جميع الأجهزة',
  },
  {
    id: 'T007',
    title: 'تصميم اللوجو',
    project: 'XYZ — هوية بصرية كاملة',
    projectId: '003',
    assignee: 'أحمد محمد',
    priority: 'high',
    dueDate: '12 · 12 · 2024',
    tags: ['تصميم', 'هوية'],
    comments: 8,
    attachments: 5,
    description: 'تصميم 3 concepts للوجو',
  },
  {
    id: 'T008',
    title: 'كتابة استراتيجية السوشيال ميديا',
    project: 'DEF — حملة تسويقية',
    projectId: '004',
    assignee: 'سارة أحمد',
    priority: 'medium',
    dueDate: '28 · 12 · 2024',
    tags: ['استراتيجية', 'سوشيال'],
    comments: 2,
    attachments: 0,
    description: 'وضع خطة محتوى للسوشيال ميديا',
  },
]

const columns = [
  { id: 'todo', title: 'To Do', titleAr: 'قيد الانتظار', color: 'bg-text-tertiary' },
  { id: 'inprogress', title: 'IN PROGRESS', titleAr: 'جاري العمل', color: 'bg-blue-500' },
  { id: 'review', title: 'REVIEW', titleAr: 'مراجعة', color: 'bg-accent' },
  { id: 'done', title: 'DONE', titleAr: 'مكتمل', color: 'bg-green-500' },
]

/* ============================================
   PAGE
   ============================================ */

export default function TasksPage() {
  const [tasks, setTasks] = useState<Record<string, Task[]>>({
    todo: [initialTasks[0], initialTasks[1], initialTasks[4], initialTasks[7]],
    inprogress: [initialTasks[2], initialTasks[3], initialTasks[6]],
    review: [initialTasks[5]],
    done: [],
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; columnId: string } | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const handleDragStart = (taskId: string, columnId: string) => {
    setDraggedTask({ taskId, columnId })
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    if (!draggedTask) return

    const task = tasks[draggedTask.columnId].find((t) => t.id === draggedTask.taskId)
    if (!task) return

    const newTasks = { ...tasks }
    newTasks[draggedTask.columnId] = newTasks[draggedTask.columnId].filter(
      (t) => t.id !== draggedTask.taskId
    )
    newTasks[targetColumnId] = [...newTasks[targetColumnId], task]

    setTasks(newTasks)
    setDraggedTask(null)
    setDragOverColumn(null)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-accent border-accent/30 bg-accent/10'
      case 'medium':
        return 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10'
      case 'low':
        return 'text-blue-500 border-blue-500/30 bg-blue-500/10'
      default:
        return 'text-text-tertiary border-border'
    }
  }

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'عاجل'
      case 'medium':
        return 'متوسط'
      case 'low':
        return 'منخفض'
      default:
        return priority
    }
  }

  const totalTasks = Object.values(tasks).flat().length
  const completedTasks = tasks.done.length
  const inProgressTasks = tasks.inprogress.length
  const overdueTasks = 2

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
                  TASKS / 004
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                TASKS<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                نظام إدارة المهام — Drag & Drop لتنظيم المهام بين المراحل.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <DotGrid />
              <button className="border border-border px-4 py-2 text-xs font-medium text-fg hover:border-accent hover:text-accent transition-colors rounded-[4px] bg-surface flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>مهمة جديدة</span>
              </button>
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* STATS */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'إجمالي المهام', value: totalTasks.toString(), icon: CheckCircle2 },
            { label: 'جاري العمل', value: inProgressTasks.toString(), icon: Clock },
            { label: 'مكتمل', value: completedTasks.toString(), icon: TrendingUp },
            { label: 'متأخر', value: overdueTasks.toString(), icon: AlertCircle },
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

        {/* SEARCH */}
        <section className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="ابحث في المهام..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-border bg-surface rounded-[4px] px-3 py-2 pr-9 text-xs text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <button className="border border-border bg-surface p-2 rounded-[4px] text-text-secondary hover:text-fg transition-colors">
            <Filter className="h-4 w-4" />
          </button>
        </section>

        {/* KANBAN BOARD */}
        <section className="grid gap-4 md:grid-cols-4">
          {columns.map((column) => (
            <div key={column.id}>
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${column.color}`} />
                  <div>
                    <h3 className="font-display text-lg text-fg leading-none">
                      {column.title}
                    </h3>
                    <p className="font-mono-tech text-[10px] text-text-tertiary mt-1">
                      {column.titleAr}
                    </p>
                  </div>
                </div>
                <span className="font-display text-xl text-text-secondary">
                  {tasks[column.id].length}
                </span>
              </div>

              {/* Drop Zone */}
              <div
                className={`min-h-[400px] border border-border rounded-[4px] p-3 space-y-3 transition-colors ${
                  dragOverColumn === column.id ? 'bg-accent/5 border-accent' : 'bg-surface/50'
                }`}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {tasks[column.id]
                  .filter(
                    (task) =>
                      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      task.project.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id, column.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <TechCard className="p-4 hover:border-line-light transition-colors">
                        <div className="relative">
                          {/* Drag Handle */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-text-tertiary" />
                              <span className="font-mono-tech text-[10px] text-accent">
                                {task.id}
                              </span>
                            </div>
                            <button className="text-text-tertiary hover:text-fg transition-colors">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Title */}
                          <h4 className="text-sm font-semibold text-fg mb-2 line-clamp-2">
                            {task.title}
                          </h4>

                          {/* Project */}
                          <div className="flex items-center gap-2 mb-3">
                            <FolderKanban className="h-3 w-3 text-text-tertiary" />
                            <span className="text-[10px] text-text-secondary truncate">
                              {task.project}
                            </span>
                          </div>

                          {/* Priority */}
                          <div className="flex items-center gap-2 mb-3">
                            <span
                              className={`border px-2 py-0.5 text-[9px] font-medium rounded-[2px] ${getPriorityColor(
                                task.priority
                              )}`}
                            >
                              <Flag className="h-2.5 w-2.5 inline ml-1" />
                              {getPriorityLabel(task.priority)}
                            </span>
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mb-3">
                            {task.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="border border-border px-1.5 py-0.5 text-[8px] font-mono-tech text-text-tertiary rounded-[2px]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-3 border-t border-border">
                            <div className="flex items-center gap-2">
                              <Users className="h-3 w-3 text-text-tertiary" />
                              <span className="text-[10px] text-text-secondary truncate max-w-[80px]">
                                {task.assignee}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              {task.comments > 0 && (
                                <div className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3 text-text-tertiary" />
                                  <span className="text-[10px] text-text-tertiary">
                                    {task.comments}
                                  </span>
                                </div>
                              )}
                              {task.attachments > 0 && (
                                <div className="flex items-center gap-1">
                                  <Paperclip className="h-3 w-3 text-text-tertiary" />
                                  <span className="text-[10px] text-text-tertiary">
                                    {task.attachments}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Due Date */}
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-text-tertiary font-mono-tech">
                            <Calendar className="h-3 w-3" />
                            <span>{task.dueDate}</span>
                          </div>
                        </div>
                      </TechCard>
                    </div>
                  ))}

                {tasks[column.id].length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-text-tertiary">
                    <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" />
                    <span className="font-mono-tech text-[10px]">لا توجد مهام</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                {totalTasks} TASKS · DRAG & DROP ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · TASK MANAGEMENT ONLINE
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
