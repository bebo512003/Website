/**
 * team — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
import type { AppRole, Json, ProfileStatus } from './core'
export type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: AppRole
  status: ProfileStatus
  employee_role_id: string | null
  role_id: string | null
  client_id: string | null
  agency_name: string | null
  agency_website: string | null
  phone: string | null
  whatsapp: string | null
  bio: string | null
  job_title: string | null
  department: string | null
  specialization: string | null
  location: string | null
  portfolio_url: string | null
  social_links: Json
  created_at: string
  updated_at: string
  must_change_password: boolean
  skills: string | null
  experience: string | null
  certifications: string | null
  previous_projects: string | null
  linkedin: string | null
  behance: string | null
  instagram: string | null
  facebook: string | null
  twitter: string | null
  personal_website: string | null
  other_social_links: Json
}


export type EmployeeRoleRow = {
  id: string
  key: string
  name: string
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}


/** The typed Database contract is generated from the real schema — see
 * lib/supabase/database.types.ts (scripts/generate-types.mjs). It is re-exported
 * here so existing imports of `Database` from '@/lib/supabase/types' keep working. */

export type { Database }


export type Profile = ProfileRow

export type ProfileUpdate = Partial<Pick<ProfileRow, 'full_name' | 'avatar_url' | 'agency_name' | 'agency_website' | 'phone' | 'bio'>>

export type EmployeeRole = EmployeeRoleRow

export type EmployeeRoleInsert = Database['public']['Tables']['employee_roles']['Insert']

export type EmployeeRoleUpdate = Database['public']['Tables']['employee_roles']['Update']
