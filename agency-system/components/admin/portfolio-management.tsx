'use client'

/* Use the original proportions for private signed previews and linked Behance images. */
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
  swapPortfolioProjectOrder,
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
import { behanceImageUrl, portfolioCoverSrc, portfolioExternalUrl, portfolioProjectPath } from '@/lib/public/portfolio-media'
import { SELECTED_WORK_PATH } from '@/lib/site'

type ProjectForm = {
  title: string
  subtitle: string
  description: string
  client_name: string
  category_id: string
  services: string
  project_date: string
  external_url: string
  cover_image_url: string
  detail_image_url: string
  featured: boolean
  published: boolean
}

const emptyProjectForm: ProjectForm = {
  title: '',
  subtitle: '',
  description: '',
  client_name: '',
  category_id: '',
  services: '',
  project_date: '',
  external_url: '',
  cover_image_url: '',
  detail_image_url: '',
  featured: true,
  published: false,
}

const categorySlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `category-${crypto.randomUUID().slice(0, 8)}`

function projectToForm(project: PortfolioProject): ProjectForm {
  return {
    title: project.title,
    subtitle: project.subtitle || '',
    description: project.description || '',
    client_name: project.client_name || '',
    category_id: project.category_id || '',
    services: project.services.join(', '),
    project_date: project.project_date || '',
    external_url: project.external_url || '',
    cover_image_url: project.cover_image_url || '',
    detail_image_url: project.detail_image_url || '',
    featured: project.featured,
    published: project.published,
  }
}

function formatProjectDate(value: string | null) {
  if (!value) return 'Date not set'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' })
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
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState('')
  const [editorError, setEditorError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState<'all' | 'selected' | 'published' | 'draft' | 'archived'>('all')
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
    setEditorError('')
    resetProjectForm()
    setProjectModalOpen(true)
  }

  const openEdit = (project: PortfolioProjectWithRelations) => {
    setEditorError('')
    setEditingProject(project)
    setProjectForm(projectToForm(project))
    setImageFiles([])
    setProjectModalOpen(true)
  }

  const submitProject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage || !user || saving) return
    const title = projectForm.title.trim()
    if (!title) {
      setEditorError('Project title is required.')
      return
    }
    const externalUrl = portfolioExternalUrl(projectForm.external_url.trim())
    if (projectForm.external_url.trim() && !externalUrl) {
      setEditorError('Enter a valid web address for the external project link.')
      return
    }
    const linkedCover = behanceImageUrl(projectForm.cover_image_url)
    const linkedPreview = behanceImageUrl(projectForm.detail_image_url)
    if ((projectForm.cover_image_url.trim() && !linkedCover) || (projectForm.detail_image_url.trim() && !linkedPreview)) {
      setEditorError('Linked images must be direct Behance CDN images, not gallery links. For other images, use the upload field.')
      return
    }
    for (const file of imageFiles) {
      const validation = validateFile(file, 'portfolio-images')
      if (!validation.valid) {
        setEditorError(validation.error || `“${file.name}” is not a valid image.`)
        return
      }
    }

    setSaving(true)
    setError('')
    setEditorError('')
    setMessage('')
    // A new/publication-ready draft must not go live until its uploads finish.
    const publish = projectForm.published && !editingProject?.archived
    const publishAfterUpload = publish && imageFiles.length > 0 && !editingProject?.published
    const payload = {
      title,
      subtitle: projectForm.subtitle.trim() || null,
      description: projectForm.description.trim() || null,
      client_name: projectForm.client_name.trim() || null,
      category_id: projectForm.category_id || null,
      services: projectForm.services.split(/[,\n]/).map((service) => service.trim()).filter(Boolean),
      project_date: projectForm.project_date || null,
      external_url: externalUrl,
      cover_image_url: linkedCover,
      detail_image_url: linkedPreview,
      featured: projectForm.featured,
      published: publish && !publishAfterUpload,
    }

    const projectResult = editingProject
      ? await updatePortfolioProject(editingProject.id, payload)
      : await createPortfolioProject(payload)

    if (projectResult.error || !projectResult.data) {
      setSaving(false)
      setEditorError(projectResult.error || 'Unable to save the portfolio project.')
      return
    }

    const projectId = projectResult.data.id
    let firstUploadedPath: string | null = null
    let operationError = ''
    for (const file of imageFiles) {
      const uploadResult = await uploadPortfolioImage(projectId, user.id, file)
      if (uploadResult.error) operationError = `“${file.name}” could not be uploaded: ${uploadResult.error}`
      else if (!firstUploadedPath && uploadResult.data) firstUploadedPath = uploadResult.data.storage_path
    }

    if (!editingProject?.cover_image_path && firstUploadedPath) {
      const coverResult = await setPortfolioProjectCoverImage(projectId, firstUploadedPath)
      if (coverResult.error) operationError = `Could not set the cover: ${coverResult.error}`
    }
    if (publishAfterUpload && !operationError) {
      const publishResult = await updatePortfolioProject(projectId, { published: true })
      if (publishResult.error) operationError = `Could not publish: ${publishResult.error}`
    }

    setSaving(false)
    setProjectModalOpen(false)
    resetProjectForm()
    await load()
    if (operationError) {
      setError(`Project saved. ${operationError}${publishAfterUpload ? ' It is still a draft.' : ''}`)
    } else {
      setMessage(publish && payload.featured
        ? 'Project saved and visible in Selected work.'
        : editingProject ? 'Portfolio project updated.' : 'Portfolio project created.')
    }
  }

  const togglePublished = async (project: PortfolioProject) => {
    if (project.archived) return
    setError('')
    const result = await updatePortfolioProject(project.id, { published: !project.published })
    if (result.error) setError(result.error)
    else {
      setMessage(result.data?.published
        ? project.featured ? 'Project published in Selected work.' : 'Project published at its public link.'
        : 'Project unpublished; it and its uploaded images are now hidden from the public site.')
      await load()
    }
  }

  const toggleFeatured = async (project: PortfolioProject) => {
    if (project.archived) return
    setError('')
    const result = await updatePortfolioProject(project.id, { featured: !project.featured })
    if (result.error) setError(result.error)
    else {
      setMessage(project.featured
        ? 'Project removed from Selected work. Its public link still works if published.'
        : project.published ? 'Project shown in Selected work.' : 'Project will appear in Selected work when published.')
      await load()
    }
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
    const current = projects[index]
    const neighbor = projects[index + direction]
    if (reordering || !current || !neighbor) return
    setReordering(true)
    setError('')
    const result = await swapPortfolioProjectOrder(current.id, neighbor.id)
    if (result.error) setError(result.error)
    else {
      await load()
      setMessage('Project order updated.')
    }
    setReordering(false)
  }

  function patchProject(projectId: string, update: (project: PortfolioProjectWithRelations) => PortfolioProjectWithRelations) {
    setProjects((rows) => rows.map((row) => row.id === projectId ? update(row) : row))
    setEditingProject((row) => row?.id === projectId ? update(row) : row)
  }

  const removeImage = async (project: PortfolioProjectWithRelations, imageId: string, storagePath: string) => {
    if (saving) return
    const ok = await confirm({
      title: 'Delete this image?',
      description: 'The image is removed from the portfolio project.',
      confirmLabel: 'Delete image',
      tone: 'destructive',
    })
    if (!ok) return
    setSaving(true)
    setEditorError('')
    if (project.cover_image_path === storagePath) {
      const coverResult = await setPortfolioProjectCoverImage(project.id, null)
      if (coverResult.error) {
        setEditorError(coverResult.error)
        setSaving(false)
        return
      }
      patchProject(project.id, (row) => ({ ...row, cover_image_path: null }))
    }
    const result = await deletePortfolioImage({ id: imageId, storage_path: storagePath })
    if (result.error) setEditorError(result.error)
    else patchProject(project.id, (row) => ({ ...row, portfolio_project_images: row.portfolio_project_images.filter((image) => image.id !== imageId) }))
    setSaving(false)
  }

  const chooseCover = async (project: PortfolioProjectWithRelations, storagePath: string | null) => {
    if (saving) return
    setSaving(true)
    setEditorError('')
    const result = await setPortfolioProjectCoverImage(project.id, storagePath)
    if (result.error) setEditorError(result.error)
    else patchProject(project.id, (row) => ({ ...row, cover_image_path: storagePath }))
    setSaving(false)
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
    return <Panel><EmptyState icon={Tag} title="Portfolio permission required" description="You need the Manage portfolio permission to edit Selected work." /></Panel>
  }

  if (loading) return <Panel><LoadingState label="Loading portfolio management…" /></Panel>

  return (
    <div className="space-y-5">
      {error && <InlineAlert>{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}

      <Panel
        title="Selected work & portfolio"
        description="Published projects marked Show in Selected work appear on the homepage. Drafts and archived projects are hidden."
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
            <select aria-label="Filter by category" className={`${inputClassName} max-w-44`} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select aria-label="Filter by state" className={`${inputClassName} max-w-40`} value={stateFilter} onChange={(event) => setStateFilter(event.target.value as 'all' | 'selected' | 'published' | 'draft' | 'archived')}>
              <option value="all">All states</option>
              <option value="selected">On homepage</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-text-tertiary">{total} project{total === 1 ? '' : 's'} · use the arrows to change the display order</p>
            <a href={SELECTED_WORK_PATH} target="_blank" rel="noopener noreferrer" className={secondaryButtonClassName}>View Selected work</a>
            <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> New portfolio project</button>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState icon={ImagePlus} title={total ? 'No portfolio projects match' : 'No portfolio projects yet'} description={total ? 'Try different search text or filters.' : 'Create a project, add images, and publish it when it is ready for the public site.'} action={!total ? <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> Create first project</button> : undefined} />
        ) : (
          <div className="divide-y divide-border">
            {projects.map((project, index) => {
              const image = portfolioCoverSrc(project)
              const onHome = project.featured && project.published && !project.archived
              return (
                <article key={project.id} className={`flex flex-col gap-4 p-5 xl:flex-row xl:items-center ${project.archived ? 'opacity-60' : ''}`}>
                  <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-raised sm:w-36">
                    {image ? (
                      <img src={image} alt={project.title} className="h-full w-full object-contain" />
                    ) : <ImagePlus className="h-6 w-6 text-text-tertiary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-fg">{project.title}</h3>
                      {onHome && <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] text-accent"><Star className="h-3 w-3" /> On homepage</span>}
                      {project.archived && <span className="rounded border border-border px-2 py-0.5 text-[10px] text-text-tertiary">Archived</span>}
                    </div>
                    {project.subtitle && <p className="mt-1 text-sm text-text-secondary">{project.subtitle}</p>}
                    <p className="mt-1 text-xs text-text-tertiary">{project.portfolio_categories?.name || 'Uncategorized'} · {formatProjectDate(project.project_date)} · {project.portfolio_project_images.length} image{project.portfolio_project_images.length === 1 ? '' : 's'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => void togglePublished(project)} aria-label={`${project.published ? 'Unpublish' : 'Publish'} ${project.title}`} disabled={project.archived} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium ${project.published ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-border text-text-tertiary hover:text-fg'}`}>
                        {project.published ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{project.published ? 'Published' : 'Draft'}
                      </button>
                      <button onClick={() => void toggleFeatured(project)} disabled={project.archived} aria-pressed={project.featured} aria-label={`${project.featured ? 'Remove' : 'Add'} ${project.title} ${project.featured ? 'from' : 'to'} Selected work`} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${project.featured ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-text-tertiary hover:text-fg'}`}>
                        <Star className="h-3.5 w-3.5" />{project.featured ? 'Selected' : 'Add to Selected work'}
                      </button>
                      {project.published && !project.archived && <a href={portfolioProjectPath(project.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded border border-border px-2.5 py-1.5 text-xs font-medium text-text-tertiary hover:text-fg">View live project</a>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 xl:max-w-[330px] xl:justify-end">
                    <button onClick={() => void moveProject(index, -1)} disabled={reordering || index === 0} className="rounded border border-border p-2 text-text-tertiary hover:text-fg disabled:opacity-30" aria-label={`Move ${project.title} up`}><ArrowUp className="h-4 w-4" /></button>
                    <button onClick={() => void moveProject(index, 1)} disabled={reordering || index === projects.length - 1} className="rounded border border-border p-2 text-text-tertiary hover:text-fg disabled:opacity-30" aria-label={`Move ${project.title} down`}><ArrowDown className="h-4 w-4" /></button>
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

      <Panel title="Portfolio categories" description="Categories label projects on the public site. Deactivating a category hides the label without removing its projects.">
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

      <Modal open={projectModalOpen} onClose={() => { if (!saving) setProjectModalOpen(false) }} title={editingProject ? 'Edit portfolio project' : 'Create portfolio project'} description="Save as a draft or publish when ready. Use Show in Selected work to include it on the homepage.">
        <form onSubmit={submitProject} className="grid gap-4 sm:grid-cols-2">
          {editorError && <div className="sm:col-span-2"><InlineAlert>{editorError}</InlineAlert></div>}
          <label className="text-xs text-text-secondary sm:col-span-2">Project title<input required className={`${inputClassName} mt-2`} value={projectForm.title} onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Card subtitle<input maxLength={160} className={`${inputClassName} mt-2`} value={projectForm.subtitle} onChange={(event) => setProjectForm({ ...projectForm, subtitle: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Client / brand name<input className={`${inputClassName} mt-2`} value={projectForm.client_name} onChange={(event) => setProjectForm({ ...projectForm, client_name: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">Category<select className={`${inputClassName} mt-2`} value={projectForm.category_id} onChange={(event) => setProjectForm({ ...projectForm, category_id: event.target.value })}><option value="">Other / uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id} disabled={!category.is_active}>{category.name}{!category.is_active ? ' (inactive)' : ''}</option>)}</select></label>
          <label className="text-xs text-text-secondary">Project date<input type="date" className={`${inputClassName} mt-2`} value={projectForm.project_date} onChange={(event) => setProjectForm({ ...projectForm, project_date: event.target.value })} /></label>
          <label className="text-xs text-text-secondary">External project URL<input type="url" placeholder="https://" className={`${inputClassName} mt-2`} value={projectForm.external_url} onChange={(event) => setProjectForm({ ...projectForm, external_url: event.target.value })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Services provided <span className="text-text-tertiary">(comma separated)</span><input className={`${inputClassName} mt-2`} placeholder="Brand strategy, Art direction, Logo design" value={projectForm.services} onChange={(event) => setProjectForm({ ...projectForm, services: event.target.value })} /></label>
          <label className="text-xs text-text-secondary sm:col-span-2">Description<textarea className={`${inputClassName} mt-2 min-h-28`} value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} /></label>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded border border-border bg-surface-raised p-3 text-sm text-text-secondary"><input type="checkbox" checked={projectForm.featured} onChange={(event) => setProjectForm({ ...projectForm, featured: event.target.checked })} className="h-4 w-4 accent-accent" /><span><span className="block font-medium text-fg">Show in Selected work</span><span className="text-xs text-text-tertiary">Include on the homepage when published.</span></span></label>
            <label className={`flex cursor-pointer items-center gap-3 rounded border border-border bg-surface-raised p-3 text-sm text-text-secondary ${editingProject?.archived ? 'opacity-50' : ''}`}><input type="checkbox" disabled={!!editingProject?.archived} checked={projectForm.published} onChange={(event) => setProjectForm({ ...projectForm, published: event.target.checked })} className="h-4 w-4 accent-accent" /><span><span className="block font-medium text-fg">Publish project</span><span className="text-xs text-text-tertiary">Make it visible to anyone.</span></span></label>
          </div>
          <label className="sm:col-span-2"><span className="text-xs text-text-secondary">Project images <span className="text-text-tertiary">(JPG, PNG, WebP, AVIF · max 10 MB each)</span></span><span className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-light bg-surface-raised px-4 py-5 text-sm text-text-secondary transition hover:border-accent hover:text-fg"><Upload className="h-4 w-4" />{imageFiles.length ? `${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} selected` : 'Choose images to upload'}<input type="file" accept={STORAGE_RULES['portfolio-images'].acceptAttribute} multiple className="sr-only" disabled={saving} onChange={(event) => { setImageFiles(Array.from(event.target.files || [])); setEditorError('') }} /></span></label>

          {editingProject && editingProject.portfolio_project_images.length > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-text-secondary">Uploaded images · choose one as the homepage cover</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {editingProject.portfolio_project_images.map((image) => {
                  const isCover = editingProject.cover_image_path === image.storage_path
                  return (
                    <div key={image.id} className={`relative aspect-square overflow-hidden rounded border bg-surface-raised ${isCover ? 'border-accent' : 'border-border'}`}>
                      {image.image_url ? (
                        <button type="button" onClick={() => void chooseCover(editingProject, image.storage_path)} disabled={saving} aria-pressed={isCover} aria-label={`Set ${image.alt_text || 'image'} as cover`} className="h-full w-full">
                          <img src={image.image_url} alt={image.alt_text || editingProject.title} className="h-full w-full object-contain" />
                        </button>
                      ) : <div className="flex h-full items-center justify-center"><ImagePlus className="h-4 w-4 text-text-tertiary" /></div>}
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">{isCover ? 'Cover' : 'Set cover'}</span>
                      <button type="button" onClick={() => void removeImage(editingProject, image.id, image.storage_path)} disabled={saving} className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white hover:bg-red-950" aria-label={`Delete ${image.alt_text || 'image'}`}><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <details className="rounded border border-border p-3 sm:col-span-2" open={Boolean(editingProject?.cover_image_url || editingProject?.detail_image_url) || undefined}>
            <summary className="cursor-pointer text-sm font-medium text-fg">Linked Behance images (optional)</summary>
            <p className="mt-2 text-xs text-text-secondary">Use direct Behance image URLs, or upload your own images above. A chosen upload overrides the linked cover. Clear the detail image URL to use the cover on the project page too.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-text-secondary">Behance cover image URL<input type="url" maxLength={1024} className={`${inputClassName} mt-2`} value={projectForm.cover_image_url} onChange={(event) => setProjectForm({ ...projectForm, cover_image_url: event.target.value })} /></label>
              <label className="text-xs text-text-secondary">Behance detail image URL<input type="url" maxLength={1024} className={`${inputClassName} mt-2`} value={projectForm.detail_image_url} onChange={(event) => setProjectForm({ ...projectForm, detail_image_url: event.target.value })} /></label>
            </div>
            {editingProject?.cover_image_url && editingProject.cover_image_path && (
              <button type="button" disabled={saving} onClick={() => void chooseCover(editingProject, null)} className={`${secondaryButtonClassName} mt-3`}>Use linked cover</button>
            )}
          </details>

          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={secondaryButtonClassName} disabled={saving} onClick={() => setProjectModalOpen(false)}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? 'Saving…' : editingProject ? 'Save project' : 'Create project'}</button></div>
        </form>
      </Modal>
    </div>
  )
}
