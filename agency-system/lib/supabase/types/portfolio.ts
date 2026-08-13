/**
 * portfolio — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
import type { Json } from './core'
// ── Public company portfolio ────────────────────────────────────────────────

// Portfolio records are deliberately separate from the internal `projects`

// table. Public reads are restricted by RLS to published, non-archived rows.

export type PortfolioCategoryRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
  display_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}


export type PortfolioProjectRow = {
  id: string
  title: string
  slug: string
  cover_image_path: string | null
  description: string | null
  client_name: string | null
  category_id: string | null
  services: string[]
  project_date: string | null
  external_url: string | null
  featured: boolean
  published: boolean
  archived: boolean
  display_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}


export type PortfolioProjectImageRow = {
  id: string
  project_id: string
  storage_path: string
  alt_text: string | null
  display_order: number
  uploaded_by: string | null
  created_at: string
}


export type PortfolioPublicRpcRow = {
  id: string
  title: string
  slug: string
  cover_image_path: string | null
  description: string | null
  client_name: string | null
  category_id: string | null
  category_name: string | null
  category_slug: string | null
  services: string[]
  project_date: string | null
  external_url: string | null
  featured: boolean
  display_order: number
  images: Json
}


export type PortfolioCategory = PortfolioCategoryRow

export type PortfolioCategoryInsert = Database['public']['Tables']['portfolio_categories']['Insert']

export type PortfolioCategoryUpdate = Database['public']['Tables']['portfolio_categories']['Update']

export type PortfolioProject = PortfolioProjectRow

export type PortfolioProjectInsert = Database['public']['Tables']['portfolio_projects']['Insert']

export type PortfolioProjectUpdate = Database['public']['Tables']['portfolio_projects']['Update']

export type PortfolioProjectImage = PortfolioProjectImageRow

export type PortfolioProjectImageInsert = Database['public']['Tables']['portfolio_project_images']['Insert']


export type PortfolioImageWithUrl = PortfolioProjectImage & { image_url: string | null }

export type PortfolioProjectWithRelations = PortfolioProject & {
  portfolio_categories: Pick<PortfolioCategory, 'id' | 'name' | 'slug' | 'is_active'> | null
  portfolio_project_images: PortfolioImageWithUrl[]
}

