/**
 * clients — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
export type ClientRow = {
  id: string
  name: string
  name_en: string | null
  type: 'enterprise' | 'smb' | 'individual' | 'potential'
  industry: string | null
  status: 'active' | 'inactive' | 'potential'
  contact_person: string | null
  contact_position: string | null
  email: string | null
  phone: string | null
  location: string | null
  website: string | null
  logo_url: string | null
  notes: string | null
  total_value: number
  project_count: number
  first_project_date: string | null
  last_interaction_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}


export type InteractionRow = {
  id: string
  type: 'meeting' | 'email' | 'call' | 'note' | 'other'
  title: string
  description: string | null
  client_id: string
  project_id: string | null
  date: string
  created_by: string | null
  created_at: string
}


export type Client = ClientRow

export type ClientInsert = Database['public']['Tables']['clients']['Insert']

export type ClientUpdate = Database['public']['Tables']['clients']['Update']

export type Interaction = InteractionRow

export type InteractionInsert = Database['public']['Tables']['interactions']['Insert']
