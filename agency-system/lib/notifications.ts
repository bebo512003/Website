// In-app notification catalog. The database writes `event` (domain) and `type`
// (UI group). Email is intentionally out of scope — these rows are inbox-only.

import type { Notification, NotificationMetadata, NotificationType } from '@/lib/supabase/types'

export const NOTIFICATION_EVENTS = [
  'submission.created',
  'submission.assigned',
  'submission.status_changed',
  'project.created',
  'project.assigned',
  'team_member.assigned',
  'task.assigned',
  'task.updated',
  'client.feedback',
  'client.approval',
  'client.revision',
  'file.shared',
  'delivery.ready',
  'task.due_soon',
  'task.due_today',
  'task.overdue',
  'project.deadline_approaching',
  'project.overdue',
] as const

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export type NotificationFilterTab =
  | 'all'
  | 'unread'
  | 'submissions'
  | 'projects'
  | 'tasks'
  | 'client'

export function getNotificationMetadata(notification: Notification): NotificationMetadata {
  if (notification.metadata && typeof notification.metadata === 'object' && !Array.isArray(notification.metadata)) {
    return notification.metadata as NotificationMetadata
  }
  return {}
}

export function notificationEvent(notification: Notification): string {
  return notification.event || notification.type
}

export function isSubmissionNotification(notification: Notification): boolean {
  const event = notificationEvent(notification)
  return (
    event.startsWith('submission.') ||
    notification.type === 'form_submission' ||
    notification.type === 'submission'
  )
}

export function isProjectNotification(notification: Notification): boolean {
  const event = notificationEvent(notification)
  return (
    event.startsWith('project.') ||
    event === 'project.deadline_approaching' ||
    event === 'project.overdue' ||
    event === 'team_member.assigned' ||
    event === 'file.shared' ||
    event === 'delivery.ready' ||
    notification.type === 'assignment' ||
    notification.type === 'project_update' ||
    notification.type === 'file_shared' ||
    notification.type === 'delivery_ready'
  )
}

export function isTaskNotification(notification: Notification): boolean {
  const event = notificationEvent(notification)
  return (
    event.startsWith('task.') ||
    notification.type === 'task_assignment' ||
    notification.type === 'task_update' ||
    notification.type === 'deadline_reminder'
  )
}

export function isClientCollaborationNotification(notification: Notification): boolean {
  const event = notificationEvent(notification)
  return (
    event.startsWith('client.') ||
    event === 'file.shared' ||
    event === 'delivery.ready' ||
    notification.type === 'client_feedback' ||
    notification.type === 'client_approval' ||
    notification.type === 'client_revision' ||
    notification.type === 'file_shared' ||
    notification.type === 'delivery_ready'
  )
}

export function staffActionUrl(notification: Notification): string | null {
  return notification.action_url
}

export function portalActionUrl(notification: Notification): string | null {
  const url = notification.action_url
  if (!url) return '/portal'
  if (url.startsWith('/portal')) return url
  if (url.startsWith('/projects/')) return `/portal/projects/${url.slice('/projects/'.length).split('?')[0]}`
  return '/portal'
}

export function resolveNotificationHref(notification: Notification, isClient: boolean): string {
  if (isClient) return portalActionUrl(notification) || '/portal'
  return staffActionUrl(notification) || '/notifications'
}

export function notificationTypeLabel(type: NotificationType | string): string {
  switch (type) {
    case 'form_submission':
    case 'submission':
    case 'submission.created':
      return 'NEW SUBMISSION'
    case 'submission.assigned':
      return 'SUBMISSION ASSIGNED'
    case 'submission.status_changed':
      return 'SUBMISSION STATUS'
    case 'assignment':
    case 'project.assigned':
    case 'team_member.assigned':
      return 'PROJECT ASSIGNMENT'
    case 'project.created':
      return 'PROJECT CREATED'
    case 'project_update':
      return 'PROJECT UPDATE'
    case 'task_assignment':
    case 'task.assigned':
      return 'TASK ASSIGNMENT'
    case 'task_update':
    case 'task.updated':
      return 'TASK UPDATE'
    case 'client_feedback':
    case 'client.feedback':
      return 'CLIENT FEEDBACK'
    case 'client_approval':
    case 'client.approval':
      return 'CLIENT APPROVAL'
    case 'client_revision':
    case 'client.revision':
      return 'REVISION REQUEST'
    case 'file_shared':
    case 'file.shared':
      return 'FILE SHARED'
    case 'delivery_ready':
    case 'delivery.ready':
      return 'DELIVERY READY'
    default:
      return 'SYSTEM INFO'
  }
}
