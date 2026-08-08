import { supabase, isDatabaseConnected } from './client'
import type {
  Client,
  ClientInsert,
  Project,
  ProjectInsert,
  Task,
  TaskInsert,
  TaskUpdate,
  FileItem,
  FileInsert,
  Interaction,
  InteractionInsert,
} from './types'

// ============================================
// CHECK CONNECTION
// ============================================

export function getDatabaseStatus(): { connected: boolean } {
  return { connected: isDatabaseConnected }
}

// ============================================
// CLIENTS
// ============================================

export async function getClients(): Promise<Client[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }
  return data || []
}

export async function getClientById(id: string): Promise<Client | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createClient(client: ClientInsert): Promise<Client | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('clients')
    .insert(client)
    .select()
    .single()

  if (error) {
    console.error('Error creating client:', error)
    return null
  }
  return data
}

export async function updateClient(id: string, updates: Partial<ClientInsert>): Promise<Client | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return null
  return data
}

export async function deleteClient(id: string): Promise<boolean> {
  if (!supabase) return false
  
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)

  return !error
}

// ============================================
// PROJECTS
// ============================================

export async function getProjects(): Promise<Project[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching projects:', error)
    return []
  }
  return data || []
}

export async function getProjectById(id: string): Promise<Project | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(*)')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function getProjectsByClientId(clientId: string): Promise<Project[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

export async function createProject(project: ProjectInsert): Promise<Project | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    return null
  }
  return data
}

export async function updateProject(id: string, updates: Partial<ProjectInsert>): Promise<Project | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return null
  return data
}

// ============================================
// TASKS
// ============================================

export async function getTasks(): Promise<Task[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('tasks')
    .select('*, projects(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching tasks:', error)
    return []
  }
  return data || []
}

export async function getTasksByProjectId(projectId: string): Promise<Task[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) return []
  return data || []
}

export async function createTask(task: TaskInsert): Promise<Task | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single()

  if (error) {
    console.error('Error creating task:', error)
    return null
  }
  return data
}

export async function updateTask(id: string, updates: Partial<TaskInsert>): Promise<Task | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return null
  return data
}

export async function moveTask(taskId: string, newStatus: Task['status']): Promise<boolean> {
  if (!supabase) return false
  
  const { error } = await supabase
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)

  return !error
}

// ============================================
// FILES
// ============================================

export async function getFiles(): Promise<FileItem[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching files:', error)
    return []
  }
  return data || []
}

export async function createFile(file: FileInsert): Promise<FileItem | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('files')
    .insert(file)
    .select()
    .single()

  if (error) {
    console.error('Error creating file:', error)
    return null
  }
  return data
}

// ============================================
// INTERACTIONS
// ============================================

export async function getInteractions(clientId: string): Promise<Interaction[]> {
  if (!supabase) return []
  
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) return []
  return data || []
}

export async function createInteraction(interaction: InteractionInsert): Promise<Interaction | null> {
  if (!supabase) return null
  
  const { data, error } = await supabase
    .from('interactions')
    .insert(interaction)
    .select()
    .single()

  if (error) {
    console.error('Error creating interaction:', error)
    return null
  }
  return data
}

// ============================================
// SEED DATA (For Development)
// ============================================

export async function seedDatabase(): Promise<void> {
  if (!supabase) {
    console.warn('Database not connected. Skipping seed.')
    return
  }

  console.log('Seeding database...')

  // Add your seed data here
  // This is useful for development/testing
}
