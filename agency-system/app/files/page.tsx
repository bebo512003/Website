'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, FileText, LoaderCircle, Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { deleteFile, getFileDownloadUrl, getFiles, getProjects, uploadProjectFile } from '@/lib/supabase/database'
import type { FileWithProject, ProjectWithClient } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export default function FilesPage() {
  const { user, can } = useAuth()
  const [files, setFiles] = useState<FileWithProject[]>([])
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [fileResult, projectResult] = await Promise.all([getFiles(), getProjects()])
    setFiles(fileResult.data); setProjects(projectResult.data); setProjectId((current) => current || projectResult.data[0]?.id || ''); setError(fileResult.error || projectResult.error || ''); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedFile || !projectId || !user) return
    setSaving(true); setError(''); setMessage('')
    const result = await uploadProjectFile(projectId, user.id, selectedFile)
    setSaving(false)
    if (result.error) setError(result.error)
    else { setModal(false); setSelectedFile(null); setMessage('File uploaded.'); await load() }
  }

  const download = async (file: FileWithProject) => {
    if (!file.storage_path) return setError('This file has no storage object.')
    const result = await getFileDownloadUrl(file.storage_path)
    if (result.error || !result.data) return setError(result.error || 'Unable to create a download link.')
    const anchor = document.createElement('a'); anchor.href = result.data; anchor.download = file.name; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  }

  const remove = async (file: FileWithProject) => {
    if (!window.confirm(`Delete “${file.name}”?`)) return
    const result = await deleteFile(file)
    if (result.error) setError(result.error)
    else { setMessage('File deleted.'); await load() }
  }

  return <Page><PageHeader eyebrow="FILES / STORAGE" title="Files" description="Private files are stored in Supabase Storage under their project and protected by project-level RLS." action={can('file.upload') ? <button onClick={() => setModal(true)} className={primaryButtonClassName} disabled={!projects.length}><Upload className="h-4 w-4" />Upload file</button> : undefined} />{error && <InlineAlert>{error}</InlineAlert>}{message && <InlineAlert tone="success">{message}</InlineAlert>}{loading ? <Panel><LoadingState label="Loading files…" /></Panel> : files.length === 0 ? <Panel><EmptyState icon={FileText} title="No files yet" description={projects.length ? 'Upload the first file to an accessible project.' : 'You need an accessible project before uploading files.'} action={projects.length && can('file.upload') ? <button onClick={() => setModal(true)} className={primaryButtonClassName}><Upload className="h-4 w-4" />Upload file</button> : undefined} /></Panel> : <Panel title="Project files" description={`${files.length} file${files.length === 1 ? '' : 's'} available to your account`}><div className="divide-y divide-border">{files.map((file) => <div key={file.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-surface-raised"><FileText className="h-4 w-4 text-accent" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="mt-1 text-xs text-text-tertiary">{formatBytes(file.size)} · {file.type} · {new Date(file.created_at).toLocaleDateString()}</p>{file.projects && <Link className="mt-1 block truncate text-xs text-text-secondary hover:text-accent" href={`/projects/${file.project_id}`}>{file.projects.name}</Link>}</div><div className="flex gap-2"><button onClick={() => void download(file)} disabled={!file.storage_path} className={secondaryButtonClassName}><Download className="h-4 w-4" />Download</button>{(can('file.delete') || file.uploaded_by === user?.id) && <button onClick={() => void remove(file)} className="rounded-md border border-border p-2.5 text-text-tertiary hover:text-red-400" aria-label={`Delete ${file.name}`}><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div></Panel>}

  <Modal open={modal} onClose={() => setModal(false)} title="Upload project file" description="Files are private and available only to users who can access the selected project."><form onSubmit={upload} className="space-y-4"><label className="block text-xs text-text-secondary">Project<select required className={`${inputClassName} mt-2`} value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="block text-xs text-text-secondary">File<input required type="file" className={`${inputClassName} mt-2 file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-accent-foreground`} onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} /></label>{selectedFile && <p className="text-xs text-text-tertiary">{selectedFile.name} · {formatBytes(selectedFile.size)}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className={secondaryButtonClassName}>Cancel</button><button className={primaryButtonClassName} disabled={saving || !selectedFile}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Upload</button></div></form></Modal></Page>
}
