'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronRight,
  FileText,
  FolderKanban,
  LoaderCircle,
  MessageSquare,
  Package,
  Paperclip,
  Trash2,
} from 'lucide-react'
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from '@/lib/db'
import type { Notification } from '@/lib/supabase/types'
import { getNotificationMetadata, notificationEvent, resolveNotificationHref } from '@/lib/notifications'
import { useAuth } from '@/contexts/auth-context'

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSecs < 60) return 'Just now'
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateString
  }
}

function getNotificationTypeIcon(notification: Notification) {
  const event = notificationEvent(notification)
  if (event.startsWith('submission.') || notification.type === 'form_submission' || notification.type === 'submission') {
    return { icon: FileText, color: 'text-accent border-accent/30 bg-accent/10', label: 'Submission' }
  }
  if (event.startsWith('task.') || notification.type === 'task_assignment' || notification.type === 'task_update') {
    return { icon: CheckSquare, color: 'text-sky-400 border-sky-500/30 bg-sky-500/10', label: 'Task' }
  }
  if (event.startsWith('client.') || notification.type === 'client_feedback' || notification.type === 'client_approval' || notification.type === 'client_revision') {
    return { icon: MessageSquare, color: 'text-violet-400 border-violet-500/30 bg-violet-500/10', label: 'Client' }
  }
  if (event === 'file.shared' || notification.type === 'file_shared') {
    return { icon: Paperclip, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', label: 'File' }
  }
  if (event === 'delivery.ready' || notification.type === 'delivery_ready') {
    return { icon: Package, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', label: 'Delivery' }
  }
  return { icon: FolderKanban, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', label: 'Project' }
}

export function NotificationDropdown({ viewAllHref = '/notifications' }: { viewAllHref?: string }) {
  const router = useRouter()
  const { isClient } = useAuth()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = 'notification-dropdown-panel'

  const load = useCallback(async () => {
    const result = await getNotifications(20)
    if (!result.error) {
      setNotifications(result.data)
      setUnreadCount(result.data.filter((n) => !n.read_at).length)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 20_000)
    const handleChanged = () => void load()
    window.addEventListener('agency-notifications-changed', handleChanged)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('agency-notifications-changed', handleChanged)
    }
  }, [load])

  // Close on outside click or Escape, and restore focus to the trigger button
  // when the panel closes so keyboard users don't lose their place in the top
  // bar's tab order.
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        // Explicit restoration: without this the browser drops focus to the
        // <body>, which is a jarring keyboard experience.
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const toggleDropdown = () => {
    if (!open) {
      setLoading(true)
      void load().finally(() => setLoading(false))
    }
    setOpen((prev) => !prev)
  }

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id)
      window.dispatchEvent(new Event('agency-notifications-changed'))
    }
    setOpen(false)
    router.push(resolveNotificationHref(notification, isClient))
  }

  const handleToggleRead = async (event: React.MouseEvent, notification: Notification) => {
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

  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation()
    setBusyActionId(id)
    await deleteNotification(id)
    setBusyActionId(null)
    window.dispatchEvent(new Event('agency-notifications-changed'))
    await load()
  }

  const handleMarkAllRead = async (event: React.MouseEvent) => {
    event.stopPropagation()
    await markAllNotificationsRead()
    window.dispatchEvent(new Event('agency-notifications-changed'))
    await load()
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleDropdown}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        className={`relative rounded-md border p-2 transition ${
          open
            ? 'border-accent bg-surface-raised text-fg shadow-sm'
            : 'border-border bg-surface text-text-secondary hover:border-line-light hover:text-fg'
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono-tech text-[9px] font-bold leading-none text-accent-foreground shadow-sm animate-in zoom-in">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown Panel */}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg border border-border bg-surface shadow-2xl z-50 overflow-hidden backdrop-blur-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-surface-raised/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fg">Notifications</span>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono-tech text-[10px] font-semibold text-accent">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="rounded-full bg-surface px-2 py-0.5 font-mono-tech text-[10px] text-text-tertiary">
                  All caught up
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface hover:text-fg transition"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-accent" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-tertiary">
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                <span>Loading notifications…</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-raised text-text-tertiary">
                  <Bell className="h-4 w-4" />
                </div>
                <p className="text-xs font-semibold text-fg">No notifications yet</p>
                <p className="mt-1 text-[11px] text-text-tertiary">
                  You will receive updates here when forms are submitted or assignments are made.
                </p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => {
                const { icon: Icon, color } = getNotificationTypeIcon(notification)
                const meta = getNotificationMetadata(notification)
                const isUnread = !notification.read_at
                const isBusy = busyActionId === notification.id

                return (
                  <article
                    key={notification.id}
                    onClick={() => void handleOpenNotification(notification)}
                    className={`group relative flex cursor-pointer gap-3 p-3.5 transition hover:bg-surface-raised ${
                      isUnread ? 'bg-accent/[0.04]' : 'opacity-85'
                    }`}
                  >
                    {/* Unread indicator */}
                    {isUnread && (
                      <span className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-accent" />
                    )}

                    {/* Icon */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${color} ms-1`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <h4
                          className={`text-xs leading-snug truncate ${
                            isUnread ? 'font-semibold text-fg' : 'font-medium text-text-secondary'
                          }`}
                        >
                          {notification.title}
                        </h4>
                        <span className="shrink-0 text-[10px] text-text-tertiary">
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </div>

                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary leading-relaxed">
                        {notification.message}
                      </p>

                      {/* Detail Chips */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono-tech text-[9px] text-text-tertiary">
                        {meta.submission_id && (
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 border border-border text-accent">
                            #{meta.submission_id.slice(0, 8)}
                          </span>
                        )}
                        {meta.client_name && (
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 border border-border">
                            {meta.client_name}
                          </span>
                        )}
                        {meta.form_name && (
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 border border-border">
                            {meta.form_name}
                          </span>
                        )}
                        {meta.project_name && (
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 border border-border">
                            {meta.project_name}
                          </span>
                        )}
                        {meta.assigned_by && (
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 border border-border">
                            by {meta.assigned_by}
                          </span>
                        )}
                        {meta.due_date && (
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 border border-border text-amber-400">
                            Due: {meta.due_date}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover action buttons */}
                    <div className="flex shrink-0 flex-col items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={(e) => void handleToggleRead(e, notification)}
                        disabled={isBusy}
                        className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-fg transition"
                        title={isUnread ? 'Mark as read' : 'Mark as unread'}
                        aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
                      >
                        {isUnread ? (
                          <Check className="h-3.5 w-3.5 text-accent" />
                        ) : (
                          <span className="h-2 w-2 rounded-full border border-text-tertiary inline-block" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => void handleDelete(e, notification.id)}
                        disabled={isBusy}
                        className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-red-400 transition"
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-surface-raised/50 p-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 w-full rounded py-1.5 text-xs font-semibold text-accent hover:brightness-110 transition"
            >
              <span>View all notifications</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
