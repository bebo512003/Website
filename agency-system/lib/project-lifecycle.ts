// Single source of truth for the project lifecycle on the client. The database
// mirrors these rules in `valid_project_status_transition` and enforces them
// with the `enforce_project_status_transition` trigger — keep the two in sync.
//
// Session 15 adds delivery conditions on top of the state machine:
// Ready for delivery and Delivered require at least one final delivery file;
// Completed also requires the internal client-approval placeholder. Archive is
// a flag (not a status) and is only allowed after Completed or Cancelled.
import type { ProjectHealth, ProjectStatus } from '@/lib/supabase/types'

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  'draft',
  'planned',
  'active',
  'waiting-for-client',
  'in-review',
  'ready-for-delivery',
  'delivered',
  'completed',
  'on-hold',
  'cancelled',
]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  active: 'Active',
  'waiting-for-client': 'Waiting for client',
  'in-review': 'In review',
  'ready-for-delivery': 'Ready for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
}

export const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['active', 'on-hold', 'cancelled'],
  active: ['waiting-for-client', 'in-review', 'on-hold', 'cancelled'],
  'waiting-for-client': ['active', 'in-review', 'on-hold', 'cancelled'],
  'in-review': ['active', 'waiting-for-client', 'ready-for-delivery', 'on-hold', 'cancelled'],
  'ready-for-delivery': ['delivered', 'in-review', 'on-hold', 'cancelled'],
  delivered: ['completed', 'in-review', 'on-hold'],
  completed: [],
  'on-hold': ['draft', 'planned', 'active', 'waiting-for-client', 'in-review', 'ready-for-delivery', 'delivered', 'cancelled'],
  cancelled: ['draft'],
}

/** Valid destination stages for a project currently in `status`. */
export function nextProjectStatuses(status: ProjectStatus): ProjectStatus[] {
  return PROJECT_STATUS_TRANSITIONS[status] ?? []
}

export function isValidProjectTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return from === to || nextProjectStatuses(from).includes(to)
}

/** The linear flow stages (excluding the terminal/pause states On Hold & Cancelled). */
export const PROJECT_FLOW: ProjectStatus[] = [
  'draft',
  'planned',
  'active',
  'waiting-for-client',
  'in-review',
  'ready-for-delivery',
  'delivered',
  'completed',
]

export const PROJECT_HEALTH_ORDER: ProjectHealth[] = ['on-track', 'at-risk', 'off-track', 'blocked']

export const PROJECT_HEALTH_LABELS: Record<ProjectHealth, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
  blocked: 'Blocked',
}

/** Tailwind classes for a status badge. */
export function projectStatusBadgeClass(status: ProjectStatus): string {
  switch (status) {
    case 'draft':
    case 'planned':
      return 'border-border text-text-tertiary'
    case 'active':
    case 'waiting-for-client':
      return 'border-cyan-500/30 text-cyan-300'
    case 'in-review':
    case 'ready-for-delivery':
      return 'border-amber-500/30 text-amber-300'
    case 'delivered':
    case 'completed':
      return 'border-emerald-500/30 text-emerald-300'
    case 'on-hold':
      return 'border-orange-500/30 text-orange-300'
    case 'cancelled':
      return 'border-red-500/30 text-red-300'
  }
}

/** Tailwind classes for a health badge. */
export function projectHealthBadgeClass(health: ProjectHealth): string {
  switch (health) {
    case 'on-track':
      return 'border-emerald-500/30 text-emerald-300'
    case 'at-risk':
      return 'border-amber-500/30 text-amber-300'
    case 'off-track':
      return 'border-orange-500/30 text-orange-300'
    case 'blocked':
      return 'border-red-500/30 text-red-300'
  }
}

/** A short human label for a raw priority value. */
export function priorityLabel(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1).replace(/-/g, ' ')
}
