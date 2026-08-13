/**
 * analytics — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { ProjectStatus, TaskPriority } from './core'
// ── Operational analytics (Session 24) ─────────────────────────────────────

// Aggregated workflow data returned by get_operational_analytics. Deliberately

// contains no budget, rate, invoice, client value, revenue, or cost fields.

export type OperationalAnalytics = {
  window: {
    days: number
    start_date: string
    end_date: string
    previous_start_date: string
    previous_end_date: string
    generated_at: string
  }
  scope: {
    all_projects: boolean
    submissions_included: boolean
  }
  submissions: {
    volume: number
    previous_volume: number
    volume_change_percent: number | null
    converted: number
    conversion_rate: number | null
    responded: number
    awaiting_response: number
    median_response_hours: number | null
    by_form: Array<{
      form_id: string
      title: string
      submissions: number
      converted: number
      conversion_rate: number
    }>
    trend: Array<{
      period_start: string
      submissions: number
      converted: number
    }>
  }
  projects: {
    active: number
    overdue: number
    by_status: Array<{ status: ProjectStatus; count: number }>
  }
  tasks: {
    open: number
    overdue: number
    unassigned: number
    due_next_7_days: number
    overdue_items: Array<{
      id: string
      title: string
      project_id: string
      project_name: string
      assignee_id: string | null
      assignee_name: string
      due_date: string
      days_overdue: number
      priority: TaskPriority
    }>
  }
  team_workload: Array<{
    user_id: string
    name: string
    job_title: string | null
    active_projects: number
    open_tasks: number
    overdue_tasks: number
    due_next_7_days: number
    in_review_tasks: number
  }>
  delivery: {
    delivered: number
    scheduled: number
    on_time: number
    late: number
    no_deadline: number
    on_time_rate: number | null
    revision_projects: number
    median_cycle_days: number | null
    median_variance_days: number | null
  }
}

