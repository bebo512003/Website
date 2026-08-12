// Shared client logic for the internal project delivery & closure workflow
// (Session 15). Mirrors the database helpers in
// `project_completion_blockers` / `project_delivery_readiness` — keep them in sync.
//
// This module is staff-only. The approval state is an INTERNAL placeholder
// recorded by the team; it is not a client-portal action and must stay
// separate from any future client-facing approval table.
import type {
  Project,
  ProjectDelivery,
  ProjectDeliveryApprovalState,
  ProjectDeliveryStatus,
  ProjectStatus,
} from '@/lib/supabase/types'

export const PROJECT_DELIVERY_STATUS_ORDER: ProjectDeliveryStatus[] = [
  'preparing',
  'ready',
  'delivered',
  'revision_requested',
  'approved',
  'superseded',
]

export const PROJECT_DELIVERY_STATUS_LABELS: Record<ProjectDeliveryStatus, string> = {
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
  revision_requested: 'Revision requested',
  approved: 'Approved (internal)',
  superseded: 'Superseded',
}

export const PROJECT_APPROVAL_STATE_ORDER: ProjectDeliveryApprovalState[] = [
  'not_requested',
  'awaiting_client',
  'approved_internally',
  'revision_required',
]

export const PROJECT_APPROVAL_STATE_LABELS: Record<ProjectDeliveryApprovalState, string> = {
  not_requested: 'Not recorded',
  awaiting_client: 'Awaiting client (internal note)',
  approved_internally: 'Approved — internal record',
  revision_required: 'Revision required',
}

/** Statuses a brand-new project (or a conversion) may start in. Delivery-stage
 * statuses require final files and cannot be the initial state. */
export const PROJECT_CREATE_STATUSES: ProjectStatus[] = [
  'draft',
  'planned',
  'active',
  'waiting-for-client',
  'in-review',
  'on-hold',
  'cancelled',
]

export type DeliveryReadiness = {
  hasPackage: boolean
  fileCount: number
  deliveryStatus: ProjectDeliveryStatus | null
  approvalState: ProjectDeliveryApprovalState | null
  isArchived: boolean
  projectStatus: ProjectStatus
  blockers: string[]
  canMarkReady: boolean
  canMarkDelivered: boolean
  canComplete: boolean
  canArchive: boolean
  canUnarchive: boolean
  canRequestRevision: boolean
  canChangeFiles: boolean
}

export function deliveryStatusBadgeClass(status: ProjectDeliveryStatus): string {
  switch (status) {
    case 'preparing':
      return 'border-border text-text-tertiary'
    case 'ready':
      return 'border-amber-500/30 text-amber-300'
    case 'delivered':
    case 'approved':
      return 'border-emerald-500/30 text-emerald-300'
    case 'revision_requested':
      return 'border-orange-500/30 text-orange-300'
    case 'superseded':
      return 'border-border text-text-tertiary'
  }
}

export function approvalStateBadgeClass(state: ProjectDeliveryApprovalState): string {
  switch (state) {
    case 'not_requested':
      return 'border-border text-text-tertiary'
    case 'awaiting_client':
      return 'border-cyan-500/30 text-cyan-300'
    case 'approved_internally':
      return 'border-emerald-500/30 text-emerald-300'
    case 'revision_required':
      return 'border-orange-500/30 text-orange-300'
  }
}

/** Latest non-superseded package — same rule as `current_project_delivery`. */
export function currentDelivery(deliveries: ProjectDelivery[]): ProjectDelivery | null {
  const open = deliveries.filter((item) => item.status !== 'superseded')
  if (open.length === 0) return null
  return open.reduce((latest, item) => (item.version > latest.version ? item : latest))
}

export function completionBlockers(
  project: Pick<Project, 'status' | 'archived_at'>,
  delivery: ProjectDelivery | null,
  fileCount: number,
): string[] {
  const blockers: string[] = []
  if (project.archived_at) blockers.push('The project is archived')
  if (project.status !== 'delivered' && project.status !== 'completed') {
    blockers.push('The project must be in Delivered before it can be completed')
  }
  if (!delivery) {
    blockers.push('Prepare a delivery package and attach at least one final delivery file')
    return blockers
  }
  if (fileCount < 1) blockers.push('Attach at least one final delivery file')
  if (delivery.status !== 'delivered' && delivery.status !== 'approved') {
    blockers.push('Mark the delivery package as delivered')
  }
  if (delivery.approval_state !== 'approved_internally') {
    blockers.push('Record the internal client-approval placeholder')
  }
  return blockers
}

export function deliveryReadiness(
  project: Pick<Project, 'status' | 'archived_at'>,
  delivery: ProjectDelivery | null,
  fileCount: number,
): DeliveryReadiness {
  const blockers = completionBlockers(project, delivery, fileCount)
  const isArchived = Boolean(project.archived_at)
  const preparing = delivery?.status === 'preparing'
  return {
    hasPackage: delivery != null,
    fileCount,
    deliveryStatus: delivery?.status ?? null,
    approvalState: delivery?.approval_state ?? null,
    isArchived,
    projectStatus: project.status,
    blockers,
    canMarkReady: !isArchived && preparing && fileCount >= 1,
    canMarkDelivered: !isArchived && fileCount >= 1 && (delivery?.status === 'preparing' || delivery?.status === 'ready' || project.status === 'ready-for-delivery'),
    canComplete: !isArchived && project.status === 'delivered' && blockers.length === 0,
    canArchive: !isArchived && (project.status === 'completed' || project.status === 'cancelled'),
    canUnarchive: isArchived,
    canRequestRevision: !isArchived && (project.status === 'ready-for-delivery' || project.status === 'delivered' || delivery?.status === 'ready' || delivery?.status === 'delivered' || delivery?.status === 'approved'),
    canChangeFiles: !isArchived && (delivery == null || preparing),
  }
}
