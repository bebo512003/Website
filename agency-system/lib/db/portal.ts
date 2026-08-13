/**
 * portal repository — data access for the portal domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok } from './shared'
import type { ClientApproval, ClientFormSubmission, ClientMessage, ClientMessageWithAuthor, ClientPortalClient, ClientPortalCollaboration, ClientPortalProject, ClientSharedFile, ClientSharedFileWithFile } from '../supabase/types'
// Client portal — Dynamic Form submissions linked to the signed-in client record

export async function getClientFormSubmissions(): Promise<Result<ClientFormSubmission[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, form_templates(title, slug)')
    .order('submitted_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientFormSubmission[])
}


// Client portal — projects owned by the signed-in client record. These go

// through sanitized SECURITY DEFINER RPCs so the browser client never reads the

// raw `projects` table (no owner/manager/team/budget/health/internal fields).

export async function getClientPortalProjects(): Promise<Result<ClientPortalProject[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('get_client_portal_projects')
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientPortalProject[])
}


export async function getClientPortalProject(id: string): Promise<Result<ClientPortalProject | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_client_portal_project', { p_project_id: id })
  if (error) return fail(null, error.message)
  const row = (data || [])[0] as ClientPortalProject | undefined
  return ok(row || null)
}


export async function getClientPortalClient(): Promise<Result<ClientPortalClient | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_client_portal_client')
  if (error) return fail(null, error.message)
  const row = (data || [])[0] as ClientPortalClient | undefined
  return ok(row || null)
}


export async function getClientPortalCollaboration(projectId: string): Promise<Result<ClientPortalCollaboration | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_client_portal_collaboration', { p_project_id: projectId })
  if (error) return fail(null, error.message)
  return ok((data || null) as unknown as ClientPortalCollaboration | null)
}


export async function addClientPortalFeedback(projectId: string, body: string): Promise<Result<ClientMessage | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_client_portal_feedback', { p_project_id: projectId, p_body: body })
  return error ? fail(null, error.message) : ok(data as unknown as ClientMessage)
}


export async function approveClientPortalDelivery(projectId: string, note?: string | null): Promise<Result<ClientApproval | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('approve_client_portal_delivery', { p_project_id: projectId, p_note: note || null })
  return error ? fail(null, error.message) : ok(data as unknown as ClientApproval)
}


export async function requestClientPortalRevision(projectId: string, note: string): Promise<Result<ClientApproval | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('request_client_portal_revision', { p_project_id: projectId, p_note: note })
  return error ? fail(null, error.message) : ok(data as unknown as ClientApproval)
}


export async function shareProjectFileWithClient(projectId: string, fileId: string, note?: string | null): Promise<Result<ClientSharedFile | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('share_project_file_with_client', { p_project_id: projectId, p_file_id: fileId, p_note: note || null })
  return error ? fail(null, error.message) : ok(data as unknown as ClientSharedFile)
}


export async function unshareProjectFileWithClient(projectId: string, fileId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.rpc('unshare_project_file_with_client', { p_project_id: projectId, p_file_id: fileId })
  return error ? fail(false, error.message) : ok(true)
}


export async function addClientVisibleMessage(projectId: string, body: string): Promise<Result<ClientMessage | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('add_client_visible_message', { p_project_id: projectId, p_body: body })
  return error ? fail(null, error.message) : ok(data as unknown as ClientMessage)
}


export async function getClientSharedFiles(projectId: string): Promise<Result<ClientSharedFileWithFile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('client_shared_files')
    .select('*, file:files(*)')
    .eq('project_id', projectId)
    .order('shared_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientSharedFileWithFile[])
}


export async function getClientMessages(projectId: string): Promise<Result<ClientMessageWithAuthor[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('client_messages')
    .select('*, author:profiles!client_messages_author_id_fkey(id, full_name, email, role)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  return error ? fail([], error.message) : ok((data || []) as unknown as ClientMessageWithAuthor[])
}


export async function getClientApprovals(projectId: string): Promise<Result<ClientApproval[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('client_approvals')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as ClientApproval[])
}

