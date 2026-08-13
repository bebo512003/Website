/**
 * files — domain types (Session 28). Row/view models used by the app;
 * the raw schema contract lives in ../database.types (generated).
 */

import type { Database } from '../database.types'
import type { Project } from './projects'
export type FileRow = {
  id: string
  name: string
  type: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'video' | 'other'
  size: number
  mime_type: string | null
  storage_path: string | null
  project_id: string | null
  client_id: string | null
  uploaded_by: string | null
  starred: boolean
  created_at: string
  updated_at: string
}


export type FileItem = FileRow

export type FileInsert = Database['public']['Tables']['files']['Insert']

export type FileWithProject = FileItem & {
  projects: Pick<Project, 'id' | 'name'> | null
  is_delivery?: boolean
}
