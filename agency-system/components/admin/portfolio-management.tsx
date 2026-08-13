'use client'

/* Portfolio assets are private Supabase signed URLs; using plain img keeps the storage URL dynamic. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  archivePortfolioProject,
  createPortfolioCategory,
  createPortfolioProject,
  deletePortfolioCategory,
  deletePortfolioImage,
  deletePortfolioProject,
  getPortfolioCategories,
  getPortfolioProjectsPage,
  reorderPortfolioProjects,
  setPortfolioProjectCoverImage,
  updatePortfolioCategory,
  updatePortfolioProject,
  uploadPortfolioImage,
} from '@/lib/db'
import { validateFile, STORAGE_RULES } from '@/lib/storage-config'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { Pagination } from '@/components/ui/pagination'
import type { PortfolioCategory, PortfolioProject, PortfolioProjectWithRelations } from '@/lib/supabase/types'
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  Modal,
  Panel,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '@/components/ui/page'
import { useConfirm } from '@/components/ui/confirm-dialog'

type ProjectForm = {
  title: string
  description: string
  client_name: string
  category_id: string
  services: string
  project_date: string
  external_url: string
  featured: boolean
  published: boolean
}

const emptyProjectForm: ProjectForm = {
  title: '',
  description: '',
  client_name: '',
  category_id: '',
  services: '',
  project_date: '',
  external_url: '',
  featured: false,
  published: false,
}

const categorySlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `category-${crypto.randomUUID().slice(0, 8)}`

function projectToForm(project: PortfolioProject): ProjectForm {
  return {
    title: project.title,
    description: project.description || '',
    client_name: project.client_name || '',
    category_id: project.category_id || '',
    services: project.services.join(', '),
    project_date: project.project_date || '',
    external_url: project.external_url || '',
    featured: project.featured,
    published: project.published,
  }
}

function formatProjectDate(value: string | null) {
  if (!value) return 'Date not set'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' })
}

function coverImage(project: PortfolioProjectWithRelations) {
  if (project.cover_image_path) {
    return project.portfolio_project_images.find((image) => image.storage_path === project.cover_image_path)?.image_url || null
  }
  return project.portfolio_project_images[0]?.image_url || null
}

export function PortfolioManagement() {
  const { user, can } = useAuth()
  const confirm = useConfirm()
  const canManage = can('portfolio.manage')
  const [projects, setProjects] = useState<PortfolioProjectWithRelations[]>([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState<PortfolioCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all')
  const [page, setPage] = useState(1)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<PortfolioProjectWithRelations | null>(null)
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const debouncedSearch = useDebouncedValue(search, 300)

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [projectResult, categoryResult] = await Promise.all([
      getPortfolioProjectsPage({ search: debouncedSearch, categoryId: categoryFilter, state: stateFilter, page, pageSize: 20 }),
      getPortfolioCategories(true),
    ])
    setProjects(projectResult.data)
    setTotal(projectResult.total)
    setCategories(categoryResult.data)
    setError(projectResult.error || categoryResult.error || '')
    setLoading(false)
  }, [canManage, debouncedSearch, categoryFilter, stateFilter, page])

  useEffect(() => { void load() }, [load])

  // Search / filter changes start again from page 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, categoryFilter, stateFilter])

  const activeCategories = useMemo(() => categories.filter((category) => category.is_active), [categories])

  const resetProjectForm = () => {
    setProjectForm({ ...emptyProjectForm, category_id: activeCategories[0]?.id || '' })
    setImageFiles([])
    setEditingProject(null)
  }

  const openCreate = () => {
    resetProjectForm()
    setProjectModalOpen(true)
  }

  const openEdit = (project: PortfolioProjectWithRelations) => {
    setEditingProject(project)
    setProjectForm(projectToForm(project))
    setImageFiles([])
    setProjectModalOpen(true)
  }

  const submitProject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage || !user) return
    if (!projectForm.title.trim()) {
      setError('Project title is required.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    const payload = {
      title: projectForm.title.trim(),
      description: projectForm.description.trim() || null,
      client_name: projectForm.client_name.trim() || null,
      category_id: projectForm.category_id || null,
      services: projectForm.services.split(/[,\n]/).map((service) => service.trim()).filter(Boolean),
      project_date: projectForm.project_date || null,
      external_url: projectForm.external_url.trim() || null,
      featured: projectForm.featured,
      published: projectForm.published,
      archived: editingProject?.archived || false,
    }

    const projectResult = editingProject
      ? await updatePortfolioProject(editingProject.id, payload)
      : await createPortfolioProject(payload)

    if (projectResult.error || !projectResult.data) {
      setSaving(false)
      setError(projectResult.error || 'Unable to save the portfolio project.')
      return
    }

    let firstUploadedPath: string | null = null
    let operationHadError = false
    for (const file of imageFiles) {
      const validation = validateFile(file, 'portfolio-images')
      if (!validation.valid) {
        operationHadError = true
        setError(validation.error || `“${file.name}” is not a valid image.`)
        continue
      }
      const uploadResult = await uploadPortfolioImage(projectResult.data.id, user.id, file)
      if (uploadResult.error) {
        operationHadError = true
        setError(uploadResult.error)
        continue
      }
      if (!firstUploadedPath && uploadResult.data) firstUploadedPath = uploadResult.data.storage_path
    }

    if (!editingProject?.cover_image_path && firstUploadedPath) {
      const coverResult = await setPortfolioProjectCoverImage(projectResult.data.id, firstUploadedPath)
      if (coverResult.error) {
        operationHadError = true
        setError(coverResult.error)
      }
    }

    setSaving(false)
    setProjectModalOpen(false)
    resetProjectForm()
    if (!operationHadError) setMessage(editingProject ? 'Portfolio project updated.' : 'Portfolio project created.')
    await load()
  }

  const togglePublished = async (project: PortfolioProject) => {
    if (project.archived) return
    setError('')
    const result = await updatePortfolioProject(project.id, { published: !project.published })
    if (result.error) setError(result.error)
    else {
      setMessage(result.data?.published ? 'Project published on the public portfolio.' : 'Project unpublished; it is private now.')
      await load()
    }
  }

  const toggleFeatured = async (project: PortfolioProject) => {
    setError('')
    const result = await updatePortfolioProject(project.id, { featured: !project.featured })
    if (result.error) setError(result.error)
    else await load()
  }

  const toggleArchive = async (project: PortfolioProject) => {
    setError('')
    const result = await archivePortfolioProject(project.id, !project.archived)
    if (result.error) setError(result.error)
    else {
      setMessage(project.archived ? 'Project restored to the portfolio workspace.' : 'Project archived and unpublished.')
      await load()
    }
  }

  const removeProject = async (project: PortfolioProject) => {
    const ok = await confirm({
      title: `Delete “${project.title}”?`,
      description: 'This removes the project and all of its images.',
      confirmLabel: 'Delete project',
      tone: 'destructive',
    })
    if (!ok) return
    setError('')
    const result = await deletePortfolioProject(project.id)
    if (result.error) setError(result.error)
    else {
      setMessage('Portfolio project deleted.')
      await load()
    }
  }

  const moveProject = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= projects.length) return
    const current = projects[index]
    const target = projects[targetIndex]
    if (!current || !target) return
    // Swap only the two adjacent display_order values — safe on any page of a
    // paginated list, unlike renumbering the entire collection.
    const reordered = [...projects]
    reordered[index] = { ...target, display_order: current.display_order }
    reordered[targetIndex] = { ...current, display_order: target.display_order }
    setProjects(reordered)
    const result = await reorderPortfolioProjects([
      { id: current.id, display_order: target.display_order },
      { id: target.id, display_order: current.display_order },
    ])
    if (result.error) {
      setError(result.error)
      await load()
    } else setMessage('Project order updated.')
  }

  const removeImage = async (project: PortfolioProjectWithRelations, imageId: string, storagePath: string) => {
    const ok = await confirm({
      title: 'Delete this image?',
      description: 'The image is removed from the portfolio project.',
      confirmLabel: 'Delete image',
      tone: 'destructive',
    })
    if (!ok) return
    setError('')
    if (project.cover_image_path === storagePath) {
      const coverResult = await setPortfolioProjectCoverImage(project.id, null)
      if (coverResult.error) {
        setError(coverResult.error)
        return
      }
    }
    const result = await deletePortfolioImage({ id: imageId, storage_path: storagePath })
    if (result.error) setError(result.error)
    else {
      setMessage('Image deleted.')
      await load()
    }
  }

  const chooseCover = async (project: PortfolioProjectWithRelations, storagePath: string) => {
    const result = await setPortfolioProjectCoverImage(project.id, storagePath)
    if (result.error) setError(result.error)
    else {
      setMessage('Cover image updated.')
      await load()
    }
  }

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!categoryName.trim()) return
    setError('')
    const result = await createPortfolioCategory({ name: categoryName.trim(), slug: categorySlug(categoryName) })
    if (result.error) setError(result.error)
    else {
      setCategoryName('')
      setMessage('Portfolio category added.')
      await load()
    }
  }

  const saveCategory = async (category: PortfolioCategory) => {
    if (!editingCategoryName.trim()) return
    const result = await updatePortfolioCategory(category.id, { name: editingCategoryName.trim(), slug: categorySlug(editingCategoryName) })
    if (result.error) setError(result.error)
    else {
      setEditingCategoryId(null)
      setMessage('Portfolio category updated.')
      await load()
    }
  }

  const toggleCategory = async (category: PortfolioCategory) => {
    const result = await updatePortfolioCategory(category.id, { is_active: !category.is_active })
    if (result.error) setError(result.error)
    else await load()
  }

  const removeCategory = async (category: PortfolioCategory) => {
    const ok = await confirm({
      title: `Delete “${category.name}”?`,
      description: 'Projects using this category will become uncategorized.',
      confirmLabel: 'Delete category',
      tone: 'destructive',
    })
    if (!ok) return
    const result = await deletePortfolioCategory(category.id)
    if (result.error) setError(result.error)
    else {
      setMessage('Portfolio category deleted.')
      await load()
    }
  }

  if (!canManage) {
    return <Panel><EmptyState icon={Tag} title="Portfolio permission required" description="Only authorized administrators can manage public portfolio content." /></Panel>
  }

  if (loading) return <Panel><LoadingState label="Loading portfolio management…" /></Panel>

  return (
    <div className="space-y-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <Panel
        title="Portfolio projects"
        description="Public visibility is controlled by Published. Draft, unpublished, and archived projects stay private under Supabase RLS."
      >
        <div className="flex flex-col gap-3 border-b border-border p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                placeholder="Search projects…"
                className={`${inputClassName} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search portfolio projects"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg"
                  aria-label="Clear portfolio search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <select aria-label="Filter by category" className={`${inputClassName} w-44`} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select aria-label="Filter by state" className={`${inputClassName} w-40`} value={stateFilter} onChange={(event) => setStateFilter(event.target.value as 'all' | 'published' | 'draft' | 'archived')}>
              <option value="all">All states</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-text-tertiary">{total} project{total === 1 ? '' : 's'} · arrows control the public grid order</p>
            <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> New portfolio project</button>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState icon={ImagePlus} title={total ? 'No portfolio projects match' : 'No portfolio projects yet'} description={total ? 'Try different search text or filters.' : 'Create a project, add images, and publish it when it is ready for the public site.'} action={!total ? <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> Create first project</button> : undefined} />
        ) : (
          <div className="divide-y divide-border">
            {projects.map((project, index) => {
              const image = coverImage(project)
              return (
                <article key={project.id} className={`flex flex-col gap-4 p-5 xl:flex-row xl:items-center ${project.archived ? 'opacity-60' : ''}`}>
                  <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-raised sm:w-36">
                    {image ? (
                      <img src={image} alt={project.title} className="h-full w-full object-cover" />
                    ) : <ImagePlus className="h-6 w-6 text-text-tertiary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-fg">{project.title}</h3>
                      {project.featured && <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] text-accent"><Star className="h-3 w-3" /> Featured</span>}
                      {project.archived && <span className="rounded border border-border px-2 py-0.5 text-[10px] text-text-tertiary">Archived</span>}
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">{project.portfolio_categories?.name || 'Uncategorized'} · {formatProjectDate(project.project_date)} · {project.portfolio_project_images.length} image{project.portfolio_project_images.length === 1 ? '' : 's'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => void togglePublished(project)} disabled={project.archived} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium ${project.published ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-border text-text-tertiary hover:text-fg'}`}>
                        {project.published ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{project.published ? 'Published' : 'Draft'}
                      </button>
                      <button onClick={() => void toggleFeatured(project)} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium ${project.featured ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-text-tertiary hover:text-fg'}`}><Star className="h-3.5 w-3.5" />{project.featured ? 'Featured' : 'Feature'}</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 xl:max-w-[330px] xl:justify-end">
                    <button onClick={() => void moveProject(index, -1)} disabled={index === 0} className="rounded border border-border p-2 text-text-tertiary hover:text-fg disabled:opacity-30" aria-label={`Move ${project.title} up`}><ArrowUp className="h-4 w-4" /></button>
                    <button onClick={() => void moveProject(index, 1)} disabled={index === projects.length - 1} className="rounded border border-border p-2 text-text-tertiary hover:text-fg disabled:opacity-30" aria-label={`Move ${project.title} down`}><ArrowDown className="h-4 w-4" /></button>
                    <button onClick={() => openEdit(project)} className="rounded border border-border p-2 text-text-tertiary hover:text-fg" aria-label={`Edit ${project.title}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => void toggleArchive(project)} className={secondaryButtonClassName}>{project.archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{project.archived ? 'Restore' : 'Archive'}</button>
                    <button onClick={() => void removeProject(project)} className="rounded border border-border p-2 text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label={`Delete ${project.title}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {projects.length > 0 && (
          <Pagination page={page} pageSize={20} total={total} onChange={(next) => setPage(Math.min(Math.max(1, next), Math.max(1, Math.ceil(total / 20))))} />
        )}
      </Panel>

      <Panel title="Portfolio categories" description="Categories power the public filter. Deactivating a category keeps existing projects safe while hiding it from new public filters.">
        <form onSubmit={addCategory} className="flex flex-col gap-2 border-b border-border p-5 sm:flex-row">
          <input className={`${inputClassName} flex-1`} placeholder="New category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          <button className={primaryButtonClassName} disabled={!categoryName.trim()}><Plus className="h-4 w-4" /> Add category</button>
        </form>
        <div className="divide-y divide-border">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              {editingCategoryId === category.id ? (
                <input autoFocus className={inputClassName} value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveCategory(category); if (event.key === 'Escape') setEditingCategoryId(null) }} />
              ) : (
                <div className="flex items-center gap-3"><Tag className="h-4 w-4 text-accent" /><span className="text-sm font-medium text-fg">{category.name}</span><span className="font-mono-tech text-[9px] text-text-tertiary">{category.slug}</span>{!category.is_active && <span className="rounded border border-border px-2 py-0.5 text-[10px] text-text-tertiary">inactive</span>}</div>
              )}
              <div className="flex flex-wrap gap-2">
                {editingCategoryId === category.id ? <><button onClick={() => void saveCategory(category)} className={primaryButtonClassName}>Save</button><button onClick={() => setEditingCategoryId(null)} className={secondaryButtonClassName}>Cancel</button></> : <><button onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name) }} className={secondaryButtonClassName}><Pencil className="h-3.5 w-3.5" /> Edit</button><button onClick={() => void toggleCategory(category)} className={secondaryButtonClassName}>{category.is_active ? 'Deactivate' : 'Activate'}</button><button onClick={() => void removeCategory(category)} className="rounded border border-border p-2 text-text-tertiary hover:text-red-400" aria-label={`Delete ${category.name}`}><Trash2 className="h-4 w-4" /></button></>}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title={editingProject ? 'Edit portfolio project' : 'Create portfolio project'} description="Only published, non-archived projects appear at /portfolio.">
        <form onSubmit={submitProject} className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-text-secondary sm:col-span-2">Project title<input required className={`${inputClassName} mt-2`} value={projectForm.title} onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Client / brand name<input className={`${inputClassName} mt-2`} value={projectForm.client_name} onChange={(event) => setProjectForm({ ...projectForm, client_name: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Category<select className={`${inputClassName} mt-2`} value={projectForm.category_id} onChange={(event) => setProjectForm({ ...projectForm, category_id: event.target.value })}><option value="">Other / uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id} disabled={!category.is_active}>{category.name}{!category.is_active ? ' (inactive)' : ''}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Project date<input type="date" className={`${inputClassName} mt-2`} value={projectForm.project_date} onChange={(event) => setProjectForm({ ...projectForm, project_date: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">External project URL<input type="url" placeholder="https://" className={`${inputClassName} mt-2`} value={projectForm.external_url} onChange={(event) => setProjectForm({ ...projectForm, external_url: event.target.value })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Services provided <span className="text-text-tertiary">(comma separated)</span><input className={`${inputClassName} mt-2`} placeholder="Brand strategy, Art direction, Logo design" value={projectForm.services} onChange={(event) => setProjectForm({ ...projectForm, services: event.target.value })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-28`} value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} /></label>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded border border-border bg-surface-raised p-3 text-sm text-text-secondary"><input type="checkbox" checked={projectForm.featured} onChange={(event) => setProjectForm({ ...projectForm, featured: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--accent))]" /><span><span className="block font-medium text-fg">Featured project</span><span className="text-xs text-text-tertiary">Show in the public featured area.</span></span></label>
            <label className={`flex cursor-pointer items-center gap-3 rounded border border-border bg-surface-raised p-3 text-sm text-text-secondary ${editingProject?.archived ? 'opacity-50' : ''}`}><input type="checkbox" disabled={!!editingProject?.archived} checked={projectForm.published} onChange={(event) => setProjectForm({ ...projectForm, published: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--accent))]" /><span><span className="block font-medium text-fg">Publish project</span><span className="text-xs text-text-tertiary">Make it visible to anyone.</span></span></label>
          </div>
          <label className="sm:col-span-2"><span className="text-xs text-text-secondary">Project images <span className="text-text-tertiary">(JPG, PNG, WebP, AVIF · max 10 MB each)</span></span><span className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-light bg-surface-raised px-4 py-5 text-sm text-text-secondary transition hover:border-accent hover:text-fg"><Upload className="h-4 w-4" />{imageFiles.length ? `${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} selected` : 'Choose images to upload'}<input type="file" accept={STORAGE_RULES['portfolio-images'].acceptAttribute} multiple className="sr-only" onChange={(event) => { const files = Array.from(event.target.files || []); setImageFiles(files); for (const f of files) { const v = validateFile(f, 'portfolio-images'); if (!v.valid) { setError(v.error || 'Invalid image file.'); break } } }} /></span></label>

          {editingProject && editingProject.portfolio_project_images.length > 0 && (
            <div className="sm:col-span-2"><p className="mb-2 text-xs text-text-secondary">Current images <span className="text-text-tertiary">(click an image to make it the cover)</span></p><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{editingProject.portfolio_project_images.map((image) => <div key={image.id} className={`group relative aspect-square overflow-hidden rounded border ${editingProject.cover_image_path === image.storage_path ? 'border-accent' : 'border-border'}`}>{image.image_url ? <button type="button" onClick={() => void chooseCover(editingProject, image.storage_path)} className="h-full w-full"><img src={image.image_url} alt={image.alt_text || editingProject.title} className="h-full w-full object-cover transition group-hover:scale-105" /></button> : <div className="flex h-full items-center justify-center bg-surface-raised"><ImagePlus className="h-4 w-4 text-text-tertiary" /></div>}<span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">{editingProject.cover_image_path === image.storage_path ? 'Cover' : 'Set cover'}</span><button type="button" onClick={() => void removeImage(editingProject, image.id, image.storage_path)} className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100" aria-label="Delete image"><Trash2 className="h-3 w-3" /></button></div>)}</div></div>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={secondaryButtonClassName} onClick={() => setProjectModalOpen(false)}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? 'Saving…' : editingProject ? 'Save project' : 'Create project'}</button></div>
        </form>
      </Modal>
    </div>
  )
}
