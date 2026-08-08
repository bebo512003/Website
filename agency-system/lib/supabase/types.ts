export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type AppRole = 'admin' | 'manager' | 'employee'
export type ProjectStatus = 'active' | 'review' | 'completed' | 'on-hold' | 'cancelled'
export type TaskStatus = 'todo' | 'inprogress' | 'review' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: AppRole
  agency_name: string | null
  agency_website: string | null
  phone: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

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

export type ProjectRow = {
  id: string
  name: string
  description: string | null
  client_id: string
  type: string
  status: ProjectStatus
  phase: number
  phase_name: string | null
  progress: number
  budget: number | null
  currency: string
  start_date: string | null
  due_date: string | null
  completed_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectMemberRow = {
  project_id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
}

export type TaskRow = {
  id: string
  title: string
  description: string | null
  project_id: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
  completed_date: string | null
  tags: string[]
  comments_count: number
  attachments_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

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

export type CommentRow = {
  id: string
  content: string
  entity_type: 'project' | 'task' | 'client' | 'file'
  entity_id: string
  author_id: string | null
  created_at: string
  updated_at: string
}

export type IntakeFormRow = {
  id: string
  service_type: 'logo_design' | 'visual_identity' | 'company_profile' | null
  status: 'draft' | 'submitted' | 'archived'
  contact_name: string | null
  contact_email: string | null
  company_name: string | null
  phone: string | null
  data: Json
  client_id: string | null
  project_id: string | null
  created_by: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type IntakeAttachmentRow = {
  id: string
  intake_id: string
  name: string
  size: number
  mime_type: string | null
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

export type NotificationRow = {
  id: string
  recipient_id: string
  actor_id: string | null
  project_id: string | null
  type: 'info' | 'assignment' | 'project_update' | 'task_update'
  title: string
  message: string
  action_url: string | null
  read_at: string | null
  created_at: string
}

type Relationship = { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }

type TableDefinition<Row extends Record<string, unknown>, Insert extends Record<string, unknown>, Update extends Record<string, unknown> = Partial<Insert>, Relationships extends Relationship[] = []> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Relationships
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDefinition<ProfileRow, {
        id: string; email: string; full_name?: string | null; avatar_url?: string | null; role?: AppRole; agency_name?: string | null; agency_website?: string | null; phone?: string | null; bio?: string | null; created_at?: string; updated_at?: string
      }>
      clients: TableDefinition<ClientRow, {
        id?: string; name: string; name_en?: string | null; type?: ClientRow['type']; industry?: string | null; status?: ClientRow['status']; contact_person?: string | null; contact_position?: string | null; email?: string | null; phone?: string | null; location?: string | null; website?: string | null; logo_url?: string | null; notes?: string | null; total_value?: number; project_count?: number; first_project_date?: string | null; last_interaction_date?: string | null; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<ClientRow>, [{ foreignKeyName: 'clients_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }]>
      projects: TableDefinition<ProjectRow, {
        id?: string; name: string; description?: string | null; client_id: string; type?: string; status?: ProjectStatus; phase?: number; phase_name?: string | null; progress?: number; budget?: number | null; currency?: string; start_date?: string | null; due_date?: string | null; completed_date?: string | null; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<ProjectRow>, [
        { foreignKeyName: 'projects_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] },
        { foreignKeyName: 'projects_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      project_members: TableDefinition<ProjectMemberRow, {
        project_id: string; user_id: string; assigned_by?: string | null; assigned_at?: string
      }, Partial<ProjectMemberRow>, [
        { foreignKeyName: 'project_members_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'project_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      tasks: TableDefinition<TaskRow, {
        id?: string; title: string; description?: string | null; project_id: string; status?: TaskStatus; priority?: TaskPriority; assignee_id?: string | null; due_date?: string | null; completed_date?: string | null; tags?: string[]; comments_count?: number; attachments_count?: number; created_by?: string | null; created_at?: string; updated_at?: string
      }, Partial<TaskRow>, [
        { foreignKeyName: 'tasks_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'tasks_assignee_id_fkey'; columns: ['assignee_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ]>
      files: TableDefinition<FileRow, {
        id?: string; name: string; type?: FileRow['type']; size?: number; mime_type?: string | null; storage_path?: string | null; project_id?: string | null; client_id?: string | null; uploaded_by?: string | null; starred?: boolean; created_at?: string; updated_at?: string
      }, Partial<FileRow>, [
        { foreignKeyName: 'files_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
        { foreignKeyName: 'files_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] },
      ]>
      interactions: TableDefinition<InteractionRow, {
        id?: string; type?: InteractionRow['type']; title: string; description?: string | null; client_id: string; project_id?: string | null; date?: string; created_by?: string | null; created_at?: string
      }, Partial<InteractionRow>, [{ foreignKeyName: 'interactions_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }]>
      comments: TableDefinition<CommentRow, {
        id?: string; content: string; entity_type: CommentRow['entity_type']; entity_id: string; author_id?: string | null; created_at?: string; updated_at?: string
      }, Partial<CommentRow>, [{ foreignKeyName: 'comments_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }]>
      intake_forms: TableDefinition<IntakeFormRow, {
        id?: string; service_type?: IntakeFormRow['service_type']; status?: IntakeFormRow['status']; contact_name?: string | null; contact_email?: string | null; company_name?: string | null; phone?: string | null; data?: Json; client_id?: string | null; project_id?: string | null; created_by?: string | null; submitted_at?: string | null; created_at?: string; updated_at?: string
      }, Partial<IntakeFormRow>>
      intake_attachments: TableDefinition<IntakeAttachmentRow, {
        id?: string; intake_id: string; name: string; size?: number; mime_type?: string | null; storage_path: string; uploaded_by?: string | null; created_at?: string
      }, Partial<IntakeAttachmentRow>>
      notifications: TableDefinition<NotificationRow, {
        id?: string; recipient_id: string; actor_id?: string | null; project_id?: string | null; type?: NotificationRow['type']; title: string; message: string; action_url?: string | null; read_at?: string | null; created_at?: string
      }, Partial<NotificationRow>, [
        { foreignKeyName: 'notifications_recipient_id_fkey'; columns: ['recipient_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'notifications_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] },
      ]>
    }
    Views: { [_ in never]: never }
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: AppRole }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_manager_or_admin: { Args: Record<string, never>; Returns: boolean }
      can_access_project: { Args: { target_project_id: string }; Returns: boolean }
      can_access_client: { Args: { target_client_id: string }; Returns: boolean }
      set_user_role: { Args: { target_user_id: string; new_role: AppRole }; Returns: ProfileRow }
      update_own_profile: { Args: { new_full_name: string; new_avatar_url: string; new_agency_name: string; new_agency_website: string; new_phone: string; new_bio: string }; Returns: ProfileRow }
      submit_intake_form: { Args: { target_intake_id: string }; Returns: IntakeFormRow }
    }
    Enums: { app_role: AppRole }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Profile = ProfileRow
export type ProfileUpdate = Partial<Pick<ProfileRow, 'full_name' | 'avatar_url' | 'agency_name' | 'agency_website' | 'phone' | 'bio'>>
export type Client = ClientRow
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type ClientUpdate = Database['public']['Tables']['clients']['Update']
export type Project = ProjectRow
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type ProjectUpdate = Database['public']['Tables']['projects']['Update']
export type ProjectMember = ProjectMemberRow
export type Task = TaskRow
export type TaskInsert = Database['public']['Tables']['tasks']['Insert']
export type TaskUpdate = Database['public']['Tables']['tasks']['Update']
export type FileItem = FileRow
export type FileInsert = Database['public']['Tables']['files']['Insert']
export type Interaction = InteractionRow
export type InteractionInsert = Database['public']['Tables']['interactions']['Insert']
export type Comment = CommentRow
export type CommentInsert = Database['public']['Tables']['comments']['Insert']
export type IntakeForm = IntakeFormRow
export type IntakeFormInsert = Database['public']['Tables']['intake_forms']['Insert']
export type IntakeFormUpdate = Database['public']['Tables']['intake_forms']['Update']
export type IntakeAttachment = IntakeAttachmentRow
export type Notification = NotificationRow

export type ProjectWithClient = Project & { clients: Pick<Client, 'id' | 'name'> | null }
export type TaskWithRelations = Task & {
  projects: Pick<Project, 'id' | 'name'> | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}
export type FileWithProject = FileItem & { projects: Pick<Project, 'id' | 'name'> | null }
