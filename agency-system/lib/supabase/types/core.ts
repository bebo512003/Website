/**
 * core — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'admin' | 'manager' | 'employee' | 'client'

export type ProfileStatus = 'active' | 'inactive'

export type ProjectStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'waiting-for-client'
  | 'in-review'
  | 'ready-for-delivery'
  | 'delivered'
  | 'completed'
  | 'on-hold'
  | 'cancelled'

export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent'

export type ProjectHealth = 'on-track' | 'at-risk' | 'off-track' | 'blocked'

export type TaskStatus = 'todo' | 'inprogress' | 'review' | 'done'

export type TaskPriority = 'high' | 'medium' | 'low'

