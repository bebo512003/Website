/**
 * portfolio repository — data access for the portfolio domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, PageQuery, PageResult, pagedFail, escapeFilterValue, executePage } from './shared'
import { validateFile, sanitizeFileName, STORAGE_RULES } from '../storage-config'
import type { PortfolioCategory, PortfolioCategoryInsert, PortfolioCategoryUpdate, PortfolioProject, PortfolioProjectImage, PortfolioProjectInsert, PortfolioProjectUpdate, PortfolioProjectWithRelations, PortfolioPublicRpcRow } from '../supabase/types'
// Public company portfolio

const PORTFOLIO_ADMIN_SELECT = `id, title, slug, cover_image_path, description, client_name, category_id, services, project_date, external_url, featured, published, archived, display_order, portfolio_categories(id, name, slug, is_active), portfolio_project_images(id, project_id, storage_path, alt_text, display_order)`


const slugifyPortfolio = (value: string) => {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return `${base || 'project'}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}


function publicRpcRowToProject(row: PortfolioPublicRpcRow): PortfolioProjectWithRelations {
  const images = Array.isArray(row.images) ? row.images.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const image = value as Record<string, unknown>
    if (typeof image.id !== 'string' || typeof image.project_id !== 'string' || typeof image.storage_path !== 'string') return []
    return [{
      id: image.id,
      project_id: image.project_id,
      storage_path: image.storage_path,
      alt_text: typeof image.alt_text === 'string' ? image.alt_text : null,
      display_order: typeof image.display_order === 'number' ? image.display_order : 0,
      uploaded_by: null,
      created_at: '',
      image_url: null,
    }]
  }) : []

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    cover_image_path: row.cover_image_path,
    description: row.description,
    client_name: row.client_name,
    category_id: row.category_id,
    services: row.services || [],
    project_date: row.project_date,
    external_url: row.external_url,
    featured: row.featured,
    published: true,
    archived: false,
    display_order: row.display_order,
    created_by: null,
    created_at: '',
    updated_at: '',
    portfolio_categories: row.category_id && row.category_name && row.category_slug
      ? { id: row.category_id, name: row.category_name, slug: row.category_slug, is_active: true }
      : null,
    portfolio_project_images: images,
  }
}


async function hydratePortfolioProjects(rows: unknown[]): Promise<PortfolioProjectWithRelations[]> {
  const projects = rows as PortfolioProjectWithRelations[]
  return Promise.all(projects.map(async (project) => {
    const images = await Promise.all((project.portfolio_project_images || []).map(async (image) => {
      const urlResult = await getPortfolioImageUrl(image.storage_path)
      return { ...image, image_url: urlResult.data }
    }))
    return {
      ...project,
      portfolio_project_images: images.sort((a, b) => a.display_order - b.display_order),
    }
  }))
}


export async function getPortfolioProjects(): Promise<Result<PortfolioProjectWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('portfolio_projects')
    .select(PORTFOLIO_ADMIN_SELECT)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return fail([], error.message)
  return ok(await hydratePortfolioProjects((data || []) as unknown[]))
}


export type PortfolioProjectListFilter = {
  search?: string
  categoryId?: string
  /** 'published' | 'draft' | 'archived' | 'all' (default 'all'). */
  state?: 'all' | 'published' | 'draft' | 'archived'
  featured?: boolean
}


/** Server-side search, category/state/featured filters, and pagination for the
 * portfolio admin list. Ordered by display_order so the reorder controls stay
 * meaningful on every page. */

export async function getPortfolioProjectsPage(
  filter: PortfolioProjectListFilter & PageQuery = {}
): Promise<PageResult<PortfolioProjectWithRelations>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 20)
  const { page = 1, pageSize = 20 } = filter
  let query = supabase
    .from('portfolio_projects')
    .select(PORTFOLIO_ADMIN_SELECT, { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) query = query.or(`title.ilike.*${q}*,client_name.ilike.*${q}*,description.ilike.*${q}*`)
  if (filter.categoryId && filter.categoryId !== 'all') query = query.eq('category_id', filter.categoryId)
  if (filter.state === 'published') query = query.eq('published', true).eq('archived', false)
  else if (filter.state === 'draft') query = query.eq('published', false).eq('archived', false)
  else if (filter.state === 'archived') query = query.eq('archived', true)
  if (filter.featured !== undefined) query = query.eq('featured', filter.featured)

  query = query.order('display_order', { ascending: true }).order('created_at', { ascending: false })
  const result = await executePage<PortfolioProjectWithRelations>(query, page, pageSize)
  if (result.error) return result
  return { ...result, data: await hydratePortfolioProjects(result.data as unknown[]) }
}


export async function getPublicPortfolioProjects(): Promise<Result<PortfolioProjectWithRelations[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.rpc('get_public_portfolio_projects')
  if (error) return fail([], error.message)
  const projects = (data || []).map((row) => publicRpcRowToProject(row as PortfolioPublicRpcRow))
  return ok(await hydratePortfolioProjects(projects))
}


export async function getPublicPortfolioProjectBySlug(slug: string): Promise<Result<PortfolioProjectWithRelations | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.rpc('get_public_portfolio_project', { p_slug: slug })
  if (error) return fail(null, error.message)
  const row = data?.[0]
  if (!row) return ok(null)
  const projects = await hydratePortfolioProjects([publicRpcRowToProject(row as PortfolioPublicRpcRow)])
  return ok(projects[0] || null)
}


export async function createPortfolioProject(input: Omit<PortfolioProjectInsert, 'slug'> & { slug?: string }): Promise<Result<PortfolioProject | null>> {
  if (!supabase) return fail(null)
  const payload: PortfolioProjectInsert = {
    ...input,
    title: input.title.trim(),
    slug: input.slug?.trim() || slugifyPortfolio(input.title),
    description: input.description?.trim() || null,
    client_name: input.client_name?.trim() || null,
    external_url: input.external_url?.trim() || null,
    services: input.services || [],
  }
  const { data, error } = await supabase.from('portfolio_projects').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data)
}


export async function updatePortfolioProject(id: string, updates: PortfolioProjectUpdate): Promise<Result<PortfolioProject | null>> {
  if (!supabase) return fail(null)
  const payload = { ...updates }
  if (typeof payload.title === 'string') payload.title = payload.title.trim()
  if (typeof payload.description === 'string') payload.description = payload.description.trim() || null
  if (typeof payload.client_name === 'string') payload.client_name = payload.client_name.trim() || null
  if (typeof payload.external_url === 'string') payload.external_url = payload.external_url.trim() || null
  const { data, error } = await supabase.from('portfolio_projects').update(payload).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}


export async function setPortfolioProjectCoverImage(id: string, storagePath: string | null): Promise<Result<PortfolioProject | null>> {
  return updatePortfolioProject(id, { cover_image_path: storagePath })
}


export async function archivePortfolioProject(id: string, archived: boolean): Promise<Result<PortfolioProject | null>> {
  return updatePortfolioProject(id, archived ? { archived: true, published: false } : { archived: false })
}


export async function deletePortfolioProject(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const images = await supabase.from('portfolio_project_images').select('storage_path').eq('project_id', id)
  if (images.error) return fail(false, images.error.message)
  const paths = (images.data || []).map((image) => image.storage_path)
  if (paths.length) {
    const storageResult = await supabase.storage.from('portfolio-images').remove(paths)
    if (storageResult.error) return fail(false, storageResult.error.message)
  }
  const { error } = await supabase.from('portfolio_projects').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function reorderPortfolioProjects(items: { id: string; display_order: number }[]): Promise<Result<boolean>> {
  const client = supabase
  if (!client) return fail(false)
  const results = await Promise.all(items.map((item) => client.from('portfolio_projects').update({ display_order: item.display_order }).eq('id', item.id)))
  const error = results.find((result) => result.error)?.error
  return error ? fail(false, error.message) : ok(true)
}


export async function getPortfolioCategories(includeInactive = true): Promise<Result<PortfolioCategory[]>> {
  if (!supabase) return fail([])
  let query = supabase.from('portfolio_categories').select('*').order('display_order').order('name')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  return error ? fail([], error.message) : ok(data || [])
}


export async function createPortfolioCategory(input: Pick<PortfolioCategoryInsert, 'name'> & Partial<Pick<PortfolioCategoryInsert, 'slug' | 'display_order'>>): Promise<Result<PortfolioCategory | null>> {
  if (!supabase) return fail(null)
  const payload: PortfolioCategoryInsert = {
    name: input.name.trim(),
    slug: input.slug?.trim() || slugifyPortfolio(input.name).replace(/-[a-f0-9]{8}$/, ''),
    display_order: input.display_order ?? 0,
  }
  const { data, error } = await supabase.from('portfolio_categories').insert(payload).select().single()
  return error ? fail(null, error.message) : ok(data)
}


export async function updatePortfolioCategory(id: string, updates: PortfolioCategoryUpdate): Promise<Result<PortfolioCategory | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('portfolio_categories').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data)
}


export async function deletePortfolioCategory(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('portfolio_categories').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}


export async function uploadPortfolioImage(projectId: string, userId: string, file: File): Promise<Result<PortfolioProjectImage | null>> {
  if (!supabase) return fail(null)
  const validation = validateFile(file, 'portfolio-images')
  if (!validation.valid) return fail(null, validation.error || 'Invalid portfolio image.')

  const safeName = validation.sanitizedName || sanitizeFileName(file.name)
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`
  const upload = await supabase.storage.from('portfolio-images').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
  if (upload.error) return fail(null, upload.error.message)

  const latest = await supabase.from('portfolio_project_images').select('display_order').eq('project_id', projectId).order('display_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = (latest.data?.display_order ?? -1) + 1
  const { data, error } = await supabase.from('portfolio_project_images').insert({
    project_id: projectId,
    storage_path: storagePath,
    alt_text: file.name.replace(/\.[^/.]+$/, ''),
    display_order: nextOrder,
    uploaded_by: userId,
  }).select().single()

  if (error) {
    await supabase.storage.from('portfolio-images').remove([storagePath])
    return fail(null, error.message)
  }
  return ok(data)
}


export async function deletePortfolioImage(image: Pick<PortfolioProjectImage, 'id' | 'storage_path'>): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const storageResult = await supabase.storage.from('portfolio-images').remove([image.storage_path])
  if (storageResult.error) return fail(false, storageResult.error.message)
  const { error } = await supabase.from('portfolio_project_images').delete().eq('id', image.id)
  return error ? fail(false, error.message) : ok(true)
}


export async function getPortfolioImageUrl(storagePath: string, expiresIn = STORAGE_RULES['portfolio-images'].signedUrlDurationSeconds || 3600): Promise<Result<string | null>> {
  if (!supabase || !storagePath) return fail(null)
  const { data, error } = await supabase.storage.from('portfolio-images').createSignedUrl(storagePath, expiresIn)
  return error ? fail(null, error.message) : ok(data.signedUrl)
}

