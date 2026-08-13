import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PUBLIC_REVALIDATE_SECONDS } from '@/lib/site'
import { isSafePortfolioStoragePath, portfolioImageSrc } from '@/lib/public/portfolio-media'
import type { Database, FormQuestion, PortfolioPublicRpcRow, PortfolioProjectWithRelations, PublicFormTemplate, PublicFormTemplateSummary } from './types'

/**
 * Session-less public catalog client.
 *
 * Always uses the anon key with no cookies and no persisted Auth session, so a
 * signed-in staff member browsing the marketing site cannot leak drafts,
 * archived work, or unpublished forms into the public HTML.
 */
export function createPublicSupabaseClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function publicRpcRowToProject(row: PortfolioPublicRpcRow): PortfolioProjectWithRelations {
  const images = Array.isArray(row.images)
    ? row.images.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const image = value as Record<string, unknown>
        if (typeof image.id !== 'string' || typeof image.project_id !== 'string' || typeof image.storage_path !== 'string') return []
        if (!isSafePortfolioStoragePath(image.storage_path)) return []
        return [{
          id: image.id,
          project_id: image.project_id,
          storage_path: image.storage_path,
          alt_text: typeof image.alt_text === 'string' ? image.alt_text : null,
          display_order: typeof image.display_order === 'number' ? image.display_order : 0,
          uploaded_by: null,
          created_at: '',
          image_url: portfolioImageSrc(image.storage_path),
        }]
      })
    : []

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
    portfolio_project_images: images.sort((a, b) => a.display_order - b.display_order),
  }
}

async function loadPublishedPortfolioProjects(): Promise<{ data: PortfolioProjectWithRelations[]; error: string | null }> {
  const supabase = createPublicSupabaseClient()
  if (!supabase) return { data: [], error: null }
  const { data, error } = await supabase.rpc('get_public_portfolio_projects')
  if (error) return { data: [], error: error.message }
  return {
    data: (data || []).map((row) => publicRpcRowToProject(row as PortfolioPublicRpcRow)),
    error: null,
  }
}

async function loadPublishedPortfolioProject(slug: string): Promise<{ data: PortfolioProjectWithRelations | null; error: string | null }> {
  const supabase = createPublicSupabaseClient()
  if (!supabase) return { data: null, error: null }
  const { data, error } = await supabase.rpc('get_public_portfolio_project', { p_slug: slug })
  if (error) return { data: null, error: error.message }
  const row = data?.[0]
  if (!row) return { data: null, error: null }
  return { data: publicRpcRowToProject(row as PortfolioPublicRpcRow), error: null }
}

async function loadPublishedForms(): Promise<{ data: PublicFormTemplateSummary[]; error: string | null }> {
  const supabase = createPublicSupabaseClient()
  if (!supabase) return { data: [], error: null }
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, slug, title, description, status, form_questions(count)')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data || []) as unknown as PublicFormTemplateSummary[], error: null }
}

async function loadPublishedFormBySlug(slug: string): Promise<{
  template: PublicFormTemplate | null
  questions: FormQuestion[]
  error: string | null
}> {
  const supabase = createPublicSupabaseClient()
  if (!supabase) return { template: null, questions: [], error: null }
  const { data: template, error: templateError } = await supabase
    .from('form_templates')
    .select('id, slug, title, description, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (templateError) return { template: null, questions: [], error: templateError.message }
  if (!template) return { template: null, questions: [], error: null }
  const { data: questions, error: questionsError } = await supabase
    .from('form_questions')
    .select('*')
    .eq('form_id', template.id)
    .order('position')
    .order('created_at')
  if (questionsError) return { template: null, questions: [], error: questionsError.message }
  return { template, questions: questions || [], error: null }
}

export const getCachedPublicPortfolioProjects = cache(async () =>
  unstable_cache(loadPublishedPortfolioProjects, ['public-portfolio-projects'], {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: ['public-portfolio'],
  })(),
)

export const getCachedPublicPortfolioProject = cache(async (slug: string) =>
  unstable_cache(
    async () => loadPublishedPortfolioProject(slug),
    ['public-portfolio-project', slug],
    { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ['public-portfolio'] },
  )(),
)

export const getCachedPublishedForms = cache(async () =>
  unstable_cache(loadPublishedForms, ['public-published-forms'], {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: ['public-forms'],
  })(),
)

export const getCachedPublishedFormBySlug = cache(async (slug: string) =>
  unstable_cache(
    async () => loadPublishedFormBySlug(slug),
    ['public-published-form', slug],
    { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ['public-forms'] },
  )(),
)
