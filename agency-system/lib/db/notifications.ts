/**
 * notifications repository — data access for the notifications domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, escapeFilterValue, PageQuery, PageResult, pagedFail, executePage } from './shared'
import type { Notification } from '../supabase/types'
export async function getNotifications(limit = 100): Promise<Result<Notification[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  return error ? fail([], error.message) : ok((data || []) as unknown as Notification[])
}


// Notification inbox tabs map onto the domain `event` / UI `type` catalog in

// lib/notifications.ts. The predicates are kept here so the same logic serves

// both the page list and the tab counts.

const NOTIFICATION_EVENTS = {
  submissions: ['submission.created', 'submission.assigned', 'submission.status_changed'],
  projects: ['project.created', 'project.assigned', 'project.deadline_approaching', 'project.overdue', 'team_member.assigned'],
  tasks: ['task.assigned', 'task.updated', 'task.due_soon', 'task.due_today', 'task.overdue'],
  client: ['client.feedback', 'client.approval', 'client.revision', 'file.shared', 'delivery.ready'],
} as const


const NOTIFICATION_TYPES = {
  submissions: ['form_submission', 'submission'],
  projects: ['assignment', 'project_update'],
  tasks: ['task_assignment', 'task_update', 'deadline_reminder'],
  client: ['client_feedback', 'client_approval', 'client_revision', 'file_shared', 'delivery_ready'],
} as const


export type NotificationTabKey = 'all' | 'unread' | 'submissions' | 'projects' | 'tasks' | 'client'


/** Builds the PostgREST `or()` predicate for one inbox tab ('' for 'all'). */

function notificationTabPredicate(tab: NotificationTabKey): string {
  if (tab === 'all' || tab === 'unread') return ''
  const events = NOTIFICATION_EVENTS[tab as keyof typeof NOTIFICATION_EVENTS]
  const types = NOTIFICATION_TYPES[tab as keyof typeof NOTIFICATION_TYPES]
  const quotedEvents = events.map((event) => `"${event}"`).join(',')
  const quotedTypes = types.map((type) => `"${type}"`).join(',')
  return `event.in.(${quotedEvents}),type.in.(${quotedTypes})`
}


export type NotificationListFilter = {
  tab?: NotificationTabKey
  search?: string
}


function notificationSearchPredicate(search: string): string {
  const q = escapeFilterValue(search)
  if (!q) return ''
  return [
    `title.ilike.*${q}*`,
    `message.ilike.*${q}*`,
    `metadata->>client_name.ilike.*${q}*`,
    `metadata->>respondent_name.ilike.*${q}*`,
    `metadata->>form_name.ilike.*${q}*`,
    `metadata->>project_name.ilike.*${q}*`,
    `metadata->>task_title.ilike.*${q}*`,
    `metadata->>assigned_by.ilike.*${q}*`,
  ].join(',')
}


/** Server-side tab filtering, search, and pagination for the notifications
 * inbox. The browser only receives the current page plus the total. */

export async function getNotificationsPage(
  filter: NotificationListFilter & PageQuery = {}
): Promise<PageResult<Notification>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 25)
  const { page = 1, pageSize = 25, tab = 'all' } = filter
  let query = supabase.from('notifications').select('*', { count: 'exact' })

  if (tab === 'unread') query = query.is('read_at', null)
  const tabPredicate = notificationTabPredicate(tab)
  if (tabPredicate) query = query.or(tabPredicate)

  const searchPredicate = notificationSearchPredicate(filter.search || '')
  if (searchPredicate) {
    query = query.or(searchPredicate)
  }

  query = query.order('created_at', { ascending: false })
  return executePage<Notification>(query, page, pageSize)
}


export type NotificationTabCounts = Record<NotificationTabKey, number>


/** Exact per-tab inbox counts computed in the database (cheap head queries). */

export async function getNotificationTabCounts(): Promise<Result<NotificationTabCounts>> {
  if (!supabase) return fail({ all: 0, unread: 0, submissions: 0, projects: 0, tasks: 0, client: 0 })
  const db = supabase
  const head = () => db.from('notifications').select('id', { count: 'exact', head: true })
  const byTab = async (tab: NotificationTabKey) => {
    let query = head()
    if (tab === 'unread') query = query.is('read_at', null)
    const predicate = notificationTabPredicate(tab)
    if (predicate) query = query.or(predicate)
    const { count } = await query
    return count || 0
  }
  const [all, unread, submissions, projects, tasks, client] = await Promise.all([
    head().then((r) => r.count || 0),
    byTab('unread'),
    byTab('submissions'),
    byTab('projects'),
    byTab('tasks'),
    byTab('client'),
  ])
  return ok({ all, unread, submissions, projects, tasks, client })
}


export async function markNotificationRead(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function markNotificationUnread(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: null }).eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function markAllNotificationsRead(): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  return error ? fail(false, error.message) : ok(true)
}


export async function deleteNotification(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function deleteAllReadNotifications(): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('notifications').delete().not('read_at', 'is', null)
  return error ? fail(false, error.message) : ok(true)
}



