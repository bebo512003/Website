// ============================================
// AGENCY OS — DATABASE TYPES
// Auto-generated from Supabase schema
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: string | null
          agency_name: string | null
          agency_website: string | null
          phone: string | null
          bio: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: string | null
          agency_name?: string | null
          agency_website?: string | null
          phone?: string | null
          bio?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: string | null
          agency_name?: string | null
          agency_website?: string | null
          phone?: string | null
          bio?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
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
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          name_en?: string | null
          type?: 'enterprise' | 'smb' | 'individual' | 'potential'
          industry?: string | null
          status?: 'active' | 'inactive' | 'potential'
          contact_person?: string | null
          contact_position?: string | null
          email?: string | null
          phone?: string | null
          location?: string | null
          website?: string | null
          logo_url?: string | null
          notes?: string | null
          total_value?: number
          project_count?: number
          first_project_date?: string | null
          last_interaction_date?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          client_id: string
          type: string
          status: 'active' | 'review' | 'completed' | 'on-hold' | 'cancelled'
          phase: number
          phase_name: string | null
          progress: number
          budget: number | null
          currency: string
          start_date: string | null
          due_date: string | null
          completed_date: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          client_id: string
          type?: string
          status?: 'active' | 'review' | 'completed' | 'on-hold' | 'cancelled'
          phase?: number
          phase_name?: string | null
          progress?: number
          budget?: number | null
          currency?: string
          start_date?: string | null
          due_date?: string | null
          completed_date?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          project_id: string
          status: 'todo' | 'inprogress' | 'review' | 'done'
          priority: 'high' | 'medium' | 'low'
          assignee_id: string | null
          due_date: string | null
          completed_date: string | null
          tags: string[]
          comments_count: number
          attachments_count: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          project_id: string
          status?: 'todo' | 'inprogress' | 'review' | 'done'
          priority?: 'high' | 'medium' | 'low'
          assignee_id?: string | null
          due_date?: string | null
          completed_date?: string | null
          tags?: string[]
          comments_count?: number
          attachments_count?: number
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
      }
      files: {
        Row: {
          id: string
          name: string
          type: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'video' | 'other'
          size: number
          mime_type: string | null
          storage_path: string | null
          project_id: string | null
          client_id: string | null
          uploaded_by: string
          starred: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type?: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'video' | 'other'
          size?: number
          mime_type?: string | null
          storage_path?: string | null
          project_id?: string | null
          client_id?: string | null
          uploaded_by?: string
          starred?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['files']['Insert']>
      }
      interactions: {
        Row: {
          id: string
          type: 'meeting' | 'email' | 'call' | 'note' | 'other'
          title: string
          description: string | null
          client_id: string
          project_id: string | null
          date: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          type?: 'meeting' | 'email' | 'call' | 'note' | 'other'
          title: string
          description?: string | null
          client_id: string
          project_id?: string | null
          date?: string
          created_by?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['interactions']['Insert']>
      }
      comments: {
        Row: {
          id: string
          content: string
          entity_type: 'project' | 'task' | 'client' | 'file'
          entity_id: string
          author_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          content: string
          entity_type: 'project' | 'task' | 'client' | 'file'
          entity_id: string
          author_id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['comments']['Insert']>
      }
    }
    Views: {
      project_overview: {
        Row: {
          id: string
          name: string
          client_name: string
          client_type: string
          status: string
          phase: number
          progress: number
          budget: number | null
          due_date: string | null
          task_count: number
          completed_tasks: number
        }
      }
      client_stats: {
        Row: {
          id: string
          name: string
          total_projects: number
          total_revenue: number
          active_projects: number
        }
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// ============================================
// CONVENIENCE TYPES
// ============================================

export type Client = Database['public']['Tables']['clients']['Row']
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type ClientUpdate = Database['public']['Tables']['clients']['Update']

export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export type Task = Database['public']['Tables']['tasks']['Row']
export type TaskInsert = Database['public']['Tables']['tasks']['Insert']
export type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export type FileItem = Database['public']['Tables']['files']['Row']
export type FileInsert = Database['public']['Tables']['files']['Insert']

export type Interaction = Database['public']['Tables']['interactions']['Row']
export type InteractionInsert = Database['public']['Tables']['interactions']['Insert']

export type Comment = Database['public']['Tables']['comments']['Row']
export type CommentInsert = Database['public']['Tables']['comments']['Insert']

export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
