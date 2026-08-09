'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  Info,
  LoaderCircle,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  deleteAllReadNotifications,
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from '@/lib/supabase/database'
import type { Notification, NotificationMetadata, NotificationType } from '@/lib/supabase/types'
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  Page,
  PageHeader,
  Panel,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '@/components/ui/page'

type FilterTab = 'all' | 'unread' | 'submissions' | 'projects' | 'tasks'

function getMetadata(notification: Notification): NotificationMetadata {
  if (notification.metadata && typeof notification.metadata === 'object' && !Array.isArray(notification.metadata)) {
    return notification.metadata as NotificationMetadata
  }
  return {}
}

function getNotificationTypeBadge(type: NotificationType) {
  switch (type) {
    case 'form_submission':
    case 'submission':
      return {
        label: 'FORM SUBMISSION',
        icon: FileText,
        badgeStyle: 'border-accent/40 bg-accent/10 text-accent',
        dotStyle: 'bg-accent',
      }
    case 'assignment':
    case 'project_update':
      return {
        label: type === 'assignment' ? 'PROJECT ASSIGNMENT' : 'PROJECT UPDATE',
        icon: FolderKanban,
        badgeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
        dotStyle: 'bg-emerald-400',
      }
    case 'task_assignment':
    case 'task_update':
      return {
        label: type === 'task_assignment' ? 'TASK ASSIGNMENT' : 'TASK UPDATE',
        icon: CheckSquare,
        badgeStyle: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
        dotStyle: 'bg-sky-400',
      }
    default:
      return {
        label: 'SYSTEM INFO',
        icon: Info,
        badgeStyle: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
        dotStyle: 'bg-amber-400',
      }
  }
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const [clearingRead, setClearingRead] = useState(false)

  const load = useCallback(async () => {
    const result = await getNotifications(100)
    setNotifications(result.data)
    setError(result.error || '')
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const handleChanged = () => void load()
    window.addEventListener('agency-notifications-changed', handleChanged)
    return () => window.removeEventListener('agency-notifications-changed', handleChanged)
  }, [load])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications])
  const readCount = useMemo(() => notifications.filter((n) => !!n.read_at).length, [notifications])
  const submissionCount = useMemo(
    () => notifications.filter((n) => n.type === 'form_submission' || n.type === 'submission').length,
    [notifications]
  )
  const projectCount = useMemo(
    () => notifications.filter((n) => n.type === 'assignment' || n.type === 'project_update').length,
    [notifications]
  )
  const taskCount = useMemo(
    () => notifications.filter((n) => n.type === 'task_assignment' || n.type === 'task_update').length,
    [notifications]
  )

  const filteredNotifications = useMemo(() => {
    let list = notifications

    // Filter by tab
    if (tab === 'unread') {
      list = list.filter((n) => !n.read_at)
    } else if (tab === 'submissions') {
      list = list.filter((n) => n.type === 'form_submission' || n.type === 'submission')
    } else if (tab === 'projects') {
      list = list.filter((n) => n.type === 'assignment' || n.type === 'project_update')
    } else if (tab === 'tasks') {
      list = list.filter((n) => n.type === 'task_assignment' || n.type === 'task_update')
    }

    // Filter by search query
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((n) => {
        const meta = getMetadata(n)
        return (
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          (meta.client_name && meta.client_name.toLowerCase().includes(q)) ||
          (meta.form_name && meta.form_name.toLowerCase().includes(q)) ||
          (meta.project_name && meta.project_name.toLowerCase().includes(q)) ||
          (meta.task_title && meta.task_title.toLowerCase().includes(q)) ||
          (meta.assigned_by && meta.assigned_by.toLowerCase().includes(q)) ||
          (meta.submission_id && meta.submission_id.toLowerCase().includes(q)) ||
          (n.submission_id && n.submission_id.toLowerCase().includes(q))
        )
      })
    }

    return list
  }, [notifications, tab, searchQuery])

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id)
      window.dispatchEvent(new Event('agency-notifications-changed'))
    }
    if (notification.action_url) {
      router.push(notification.action_url)
    } else {
      await load()
    }
  }

  const toggleReadStatus = async (event: React.MouseEvent, notification: Notification) => {
    event.stopPropagation()
    setBusyActionId(notification.id)
    if (notification.read_at) {
      await markNotificationUnread(notification.id)
    } else {
      await markNotificationRead(notification.id)
    }
    setBusyActionId(null)
    window.dispatchEvent(new Event('agency-notifications-changed'))
    await load()
  }

  const readAll = async () => {
    const result = await markAllNotificationsRead()
    if (result.error) {
      setError(result.error)
    } else {
      window.dispatchEvent(new Event('agency-notifications-changed'))
      await load()
    }
  }

  const removeNotification = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation()
    setBusyActionId(id)
    const result = await deleteNotification(id)
    setBusyActionId(null)
    if (result.error) {
      setError(result.error)
    } else {
      window.dispatchEvent(new Event('agency-notifications-changed'))
      await load()
    }
  }

  const clearAllRead = async () => {
    if (!window.confirm('Delete all read notifications from your inbox?')) return
    setClearingRead(true)
    const result = await deleteAllReadNotifications()
    setClearingRead(false)
    if (result.error) {
      setError(result.error)
    } else {
      window.dispatchEvent(new Event('agency-notifications-changed'))
      await load()
    }
  }

  const copyText = (text: string, id: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <Page>
      <PageHeader
        eyebrow="NOTIFICATIONS / INBOX"
        title="Notifications"
        description="Internal notifications for form submissions, project assignments, and task updates."
        action={
          <div className="flex items-center gap-2">
            {readCount > 0 && (
              <button
                type="button"
                onClick={() => void clearAllRead()}
                disabled={clearingRead}
                className={secondaryButtonClassName}
              >
                {clearingRead ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Clear read ({readCount})
              </button>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={() => void readAll()}
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read ({unreadCount})
              </button>
            )}
          </div>
        }
      />

      {error && <InlineAlert>{error}</InlineAlert>}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tab Buttons */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              tab === 'all'
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
            }`}
          >
            All <span className="font-mono-tech text-[10px] text-text-tertiary">({notifications.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('unread')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              tab === 'unread'
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
            }`}
          >
            Unread <span className="font-mono-tech text-[10px] text-accent">({unreadCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('submissions')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              tab === 'submissions'
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
            }`}
          >
            Form Submissions <span className="font-mono-tech text-[10px] text-text-tertiary">({submissionCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('projects')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              tab === 'projects'
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
            }`}
          >
            Projects <span className="font-mono-tech text-[10px] text-text-tertiary">({projectCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              tab === 'tasks'
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
            }`}
          >
            Tasks <span className="font-mono-tech text-[10px] text-text-tertiary">({taskCount})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in notifications…"
            className={`${inputClassName} py-1.5 pl-8 pr-7 text-xs`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <Panel
        title="Inbox"
        description={`${filteredNotifications.length} notification${
          filteredNotifications.length === 1 ? '' : 's'
        } ${tab !== 'all' ? `(${tab})` : ''}`}
      >
        {loading ? (
          <LoadingState label="Loading notifications…" />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Your inbox is empty"
            description="Form submissions, project assignments, and task updates will be delivered here automatically."
          />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="No matching notifications"
            description={
              searchQuery
                ? `No notifications found matching “${searchQuery}”. Try clearing your search.`
                : 'No notifications in this filter category.'
            }
            action={
              searchQuery || tab !== 'all' ? (
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => {
                    setSearchQuery('')
                    setTab('all')
                  }}
                >
                  Reset filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {filteredNotifications.map((notification) => {
              const isUnread = !notification.read_at
              const meta = getMetadata(notification)
              const badge = getNotificationTypeBadge(notification.type)
              const BadgeIcon = badge.icon
              const isBusy = busyActionId === notification.id
              const dateObj = new Date(notification.created_at)

              return (
                <article
                  key={notification.id}
                  className={`group relative flex flex-col gap-4 p-5 transition sm:flex-row sm:items-start ${
                    isUnread
                      ? 'bg-accent/[0.04] border-l-2 border-accent'
                      : 'border-l-2 border-transparent hover:bg-surface-raised/60'
                  }`}
                >
                  {/* Left Column: Icon & Content */}
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => void openNotification(notification)}
                  >
                    {/* Top Row: Type Badge, Read indicator, Date */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono-tech text-[9px] font-semibold ${badge.badgeStyle}`}
                      >
                        <BadgeIcon className="h-3 w-3" />
                        {badge.label}
                      </span>

                      {isUnread ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-mono-tech text-[9px] font-semibold text-accent">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                          UNREAD
                        </span>
                      ) : (
                        <span className="font-mono-tech text-[9px] text-text-tertiary">
                          READ
                        </span>
                      )}

                      <span className="font-mono-tech text-[10px] text-text-tertiary ms-auto sm:ms-0">
                        {dateObj.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        ·{' '}
                        {dateObj.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="mt-2.5 text-base font-semibold text-fg group-hover:text-accent transition">
                      {notification.title}
                    </h3>

                    {/* Message */}
                    <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                      {notification.message}
                    </p>

                    {/* Rich Metadata Box */}
                    {(meta.submission_id ||
                      meta.form_name ||
                      meta.client_name ||
                      meta.project_name ||
                      meta.task_title ||
                      meta.assigned_by ||
                      meta.due_date) && (
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border bg-surface p-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                        {/* Form Submission fields */}
                        {(meta.submission_id || notification.submission_id) && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Submission ID
                            </span>
                            <div className="mt-0.5 flex items-center gap-1">
                              <span className="font-mono-tech text-xs font-semibold text-accent">
                                #{(meta.submission_id || notification.submission_id)?.slice(0, 8)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyText(
                                    meta.submission_id || notification.submission_id || '',
                                    notification.id
                                  )
                                }}
                                className="text-text-tertiary hover:text-fg"
                                title="Copy Submission ID"
                              >
                                {copiedId === notification.id ? (
                                  <Check className="h-3 w-3 text-green-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {meta.form_name && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Form
                            </span>
                            <span className="mt-0.5 block truncate font-medium text-fg">
                              {meta.form_name}
                            </span>
                          </div>
                        )}

                        {meta.client_name && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Client / Respondent
                            </span>
                            <span className="mt-0.5 block truncate font-medium text-fg">
                              {meta.client_name}
                            </span>
                          </div>
                        )}

                        {meta.respondent_email && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Email
                            </span>
                            <span className="mt-0.5 block truncate font-medium text-text-secondary">
                              {meta.respondent_email}
                            </span>
                          </div>
                        )}

                        {/* Project / Task fields */}
                        {meta.project_name && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Project
                            </span>
                            <span className="mt-0.5 block truncate font-medium text-fg">
                              {meta.project_name}
                            </span>
                          </div>
                        )}

                        {meta.task_title && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Task
                            </span>
                            <span className="mt-0.5 block truncate font-medium text-fg">
                              {meta.task_title}
                            </span>
                          </div>
                        )}

                        {meta.assigned_by && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Assigned By
                            </span>
                            <span className="mt-0.5 block truncate font-medium text-text-secondary">
                              {meta.assigned_by}
                            </span>
                          </div>
                        )}

                        {meta.status && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Status
                            </span>
                            <span className="mt-0.5 block capitalize font-medium text-fg">
                              {meta.status}
                            </span>
                          </div>
                        )}

                        {meta.due_date && (
                          <div>
                            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-text-tertiary">
                              Due Date
                            </span>
                            <span className="mt-0.5 block font-mono-tech text-xs font-semibold text-amber-400">
                              {meta.due_date}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    {notification.action_url && (
                      <button
                        type="button"
                        onClick={() => void openNotification(notification)}
                        className={primaryButtonClassName}
                      >
                        <span>Open</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => void toggleReadStatus(e, notification)}
                      disabled={isBusy}
                      className={secondaryButtonClassName}
                      title={isUnread ? 'Mark as read' : 'Mark as unread'}
                    >
                      {isUnread ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-accent" />
                          <span className="hidden sm:inline">Mark read</span>
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 rounded-full border border-text-tertiary" />
                          <span className="hidden sm:inline">Mark unread</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => void removeNotification(e, notification.id)}
                      disabled={isBusy}
                      className="rounded-md border border-border p-2.5 text-text-tertiary hover:border-red-500/30 hover:text-red-400 transition"
                      title="Delete notification"
                      aria-label={`Delete notification: ${notification.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Panel>
    </Page>
  )
}
