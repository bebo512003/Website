/**
 * files repository — data access for the files domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok } from './shared'
import { addProjectDeliveryFile } from './projects'
import { validateFile, sanitizeFileName, STORAGE_RULES } from '../storage-config'
import type { FileItem, FileWithProject } from '../supabase/types'
export async function getFilesByProjectId(projectId: string): Promise<Result<FileItem[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('files').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
  return error ? fail([], error.message) : ok((data || []) as unknown as FileItem[])
}


export async function getFiles(): Promise<Result<FileWithProject[]>> {
  if (!supabase) return fail([])
  const [filesResult, deliveryLinks, deliveryPackages] = await Promise.all([
    supabase.from('files').select('*, projects(id, name)').order('created_at', { ascending: false }),
    supabase.from('project_delivery_files').select('file_id, delivery_id'),
    supabase.from('project_deliveries').select('id, status'),
  ])
  if (filesResult.error) return fail([], filesResult.error.message)
  const openPackages = new Set(
    ((deliveryPackages.data || []) as { id: string; status: string }[])
      .filter((pkg) => pkg.status !== 'superseded')
      .map((pkg) => pkg.id),
  )
  const deliveryIds = new Set(
    ((deliveryLinks.data || []) as { file_id: string; delivery_id: string }[])
      .filter((row) => openPackages.has(row.delivery_id))
      .map((row) => row.file_id),
  )
  const files = ((filesResult.data || []) as unknown as FileWithProject[]).map((file) => ({
    ...file,
    is_delivery: deliveryIds.has(file.id),
  }))
  return ok(files)
}


function getFileType(file: File): FileItem['type'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  if (/spreadsheet|excel|csv/.test(file.type)) return 'spreadsheet'
  if (/zip|compressed|archive/.test(file.type)) return 'archive'
  if (/document|word|text/.test(file.type)) return 'document'
  return 'other'
}


export async function uploadProjectFile(projectId: string, userId: string, file: File, options?: { asDelivery?: boolean }): Promise<Result<FileItem | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'project-files')
  if (!validation.valid) return fail(null, validation.error || 'Invalid project file.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('project-files').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (upload.error) return fail(null, upload.error.message)

  const { data, error } = await supabase.from('files').insert({
    name: file.name,
    type: getFileType(file),
    size: file.size,
    mime_type: file.type || null,
    storage_path: storagePath,
    project_id: projectId,
    uploaded_by: userId,
  }).select().single()

  if (error) {
    await supabase.storage.from('project-files').remove([storagePath])
    return fail(null, error.message)
  }
  if (options?.asDelivery && data) {
    const marked = await addProjectDeliveryFile(projectId, data.id)
    if (marked.error) return fail(data as unknown as FileItem | null, marked.error)
  }
  return ok(data as unknown as FileItem | null)
}


export async function getFileDownloadUrl(storagePath: string, expiresIn = STORAGE_RULES['project-files'].signedUrlDurationSeconds || 120): Promise<Result<string | null>> {
  if (!supabase || !storagePath) return fail(null)
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(storagePath, expiresIn)
  return error ? fail(null, error.message) : ok(data.signedUrl)
}


export async function deleteFile(file: Pick<FileItem, 'id' | 'storage_path'>): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  if (file.storage_path) {
    const storageResult = await supabase.storage.from('project-files').remove([file.storage_path])
    if (storageResult.error) return fail(false, storageResult.error.message)
  }
  const { error } = await supabase.from('files').delete().eq('id', file.id)
  return error ? fail(false, error.message) : ok(true)
}





