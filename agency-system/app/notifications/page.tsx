'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, ExternalLink, Trash2 } from 'lucide-react'
import { deleteNotification, getNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/supabase/database'
import type { Notification } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, secondaryButtonClassName } from '@/components/ui/page'

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const result = await getNotifications()
    setNotifications(result.data); setError(result.error || ''); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const read = async (notification: Notification, open = false) => {
    if (!notification.read_at) {
      const result = await markNotificationRead(notification.id)
      if (result.error) return setError(result.error)
    }
    window.dispatchEvent(new Event('agency-notifications-changed'))
    if (open && notification.action_url) router.push(notification.action_url)
    else await load()
  }

  const readAll = async () => {
    const result = await markAllNotificationsRead()
    if (result.error) setError(result.error); else { window.dispatchEvent(new Event('agency-notifications-changed')); await load() }
  }

  const remove = async (id: string) => {
    const result = await deleteNotification(id)
    if (result.error) setError(result.error); else { window.dispatchEvent(new Event('agency-notifications-changed')); await load() }
  }

  const unread = notifications.filter((notification) => !notification.read_at).length

  return <Page><PageHeader eyebrow="NOTIFICATIONS / INBOX" title="Notifications" description="Project assignments and important project updates are delivered to your private inbox." action={unread ? <button className={secondaryButtonClassName} onClick={() => void readAll()}><CheckCheck className="h-4 w-4" />Mark all read</button> : undefined} />{error && <InlineAlert>{error}</InlineAlert>}<Panel title="Inbox" description={`${unread} unread notification${unread === 1 ? '' : 's'}`}>{loading ? <LoadingState label="Loading notifications…" /> : notifications.length === 0 ? <EmptyState icon={Bell} title="No notifications" description="New project assignments and project updates will appear here." /> : <div className="divide-y divide-border">{notifications.map((notification) => <article key={notification.id} className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start ${notification.read_at ? 'opacity-65' : 'bg-accent/[0.03]'}`}><button className="min-w-0 flex-1 text-left" onClick={() => void read(notification)}><div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${notification.read_at ? 'bg-border' : 'bg-accent'}`} /><h2 className="text-sm font-semibold">{notification.title}</h2></div><p className="ml-4 mt-2 text-sm text-text-secondary">{notification.message}</p><p className="ml-4 mt-2 text-[11px] text-text-tertiary">{new Date(notification.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p></button><div className="flex gap-2">{notification.action_url && <button onClick={() => void read(notification, true)} className={secondaryButtonClassName}>Open<ExternalLink className="h-3.5 w-3.5" /></button>}<button onClick={() => void remove(notification.id)} className="rounded-md border border-border p-2.5 text-text-tertiary hover:text-red-400" aria-label={`Delete ${notification.title}`}><Trash2 className="h-4 w-4" /></button></div></article>)}</div>}</Panel></Page>
}
