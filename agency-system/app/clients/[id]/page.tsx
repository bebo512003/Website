'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, ExternalLink, FolderKanban, Globe, Mail, MapPin, Phone, User } from 'lucide-react'
import { getClientById, getProjectsByClientId } from '@/lib/supabase/database'
import type { Client, Project } from '@/lib/supabase/types'
import { PROJECT_STATUS_LABELS } from '@/lib/project-lifecycle'
import { ClientPortalAccess } from '@/components/admin/client-portal-access'
import { EmptyState, InlineAlert, LoadingState, Page, PageHeader, Panel, secondaryButtonClassName } from '@/components/ui/page'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [clientResult, projectsResult] = await Promise.all([getClientById(id), getProjectsByClientId(id)])
    setClient(clientResult.data); setProjects(projectsResult.data); setError(clientResult.error || projectsResult.error || ''); setLoading(false)
  }, [id])
  useEffect(() => { void load() }, [load])

  if (loading) return <Page><PageHeader eyebrow="CLIENTS / DETAIL" title="Client" /><Panel><LoadingState label="Loading client…" /></Panel></Page>
  if (!client) return <Page><PageHeader eyebrow="CLIENTS / DETAIL" title="Client" /><InlineAlert>{error || 'This client does not exist or is outside your project access.'}</InlineAlert><Link className={secondaryButtonClassName} href="/clients"><ArrowLeft className="h-4 w-4" />Back to clients</Link></Page>

  const website = client.website ? (client.website.startsWith('http') ? client.website : `https://${client.website}`) : null

  return <Page><div><Link href="/clients" className="inline-flex items-center gap-2 text-xs text-text-tertiary hover:text-accent"><ArrowLeft className="h-3.5 w-3.5" />Back to clients</Link></div><PageHeader eyebrow={`CLIENT / ${client.type.toUpperCase()}`} title={client.name} description={client.notes || 'No client notes have been added.'} />{error && <InlineAlert>{error}</InlineAlert>}<ClientPortalAccess clientId={client.id} /><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><Panel title="Contact information"><div className="grid gap-5 p-5 sm:grid-cols-2">{client.contact_person && <div><User className="h-4 w-4 text-accent" /><p className="mt-3 text-xs text-text-tertiary">Contact</p><p className="mt-1 text-sm font-semibold">{client.contact_person}</p><p className="text-xs text-text-secondary">{client.contact_position}</p></div>}{client.email && <div><Mail className="h-4 w-4 text-accent" /><p className="mt-3 text-xs text-text-tertiary">Email</p><a className="mt-1 block break-all text-sm font-semibold hover:text-accent" href={`mailto:${client.email}`}>{client.email}</a></div>}{client.phone && <div><Phone className="h-4 w-4 text-accent" /><p className="mt-3 text-xs text-text-tertiary">Phone</p><a className="mt-1 block text-sm font-semibold hover:text-accent" href={`tel:${client.phone}`}>{client.phone}</a></div>}{client.location && <div><MapPin className="h-4 w-4 text-accent" /><p className="mt-3 text-xs text-text-tertiary">Location</p><p className="mt-1 text-sm font-semibold">{client.location}</p></div>}{website && <div><Globe className="h-4 w-4 text-accent" /><p className="mt-3 text-xs text-text-tertiary">Website</p><a target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-sm font-semibold hover:text-accent" href={website}>{client.website}<ExternalLink className="h-3 w-3" /></a></div>}</div></Panel><Panel className="p-6"><Building2 className="h-5 w-5 text-accent" /><p className="mt-5 text-xs text-text-tertiary">Account status</p><p className="mt-1 text-lg font-semibold capitalize">{client.status}</p><p className="mt-5 text-xs text-text-tertiary">Industry</p><p className="mt-1 text-sm font-semibold">{client.industry || 'Not provided'}</p><p className="mt-5 text-xs text-text-tertiary">Projects visible to you</p><p className="mt-1 font-display text-4xl">{projects.length}</p></Panel></div><Panel title="Projects" description="Only projects authorized by RLS are included.">{projects.length === 0 ? <EmptyState icon={FolderKanban} title="No accessible projects" description="No projects for this client are available to your account." /> : <div className="divide-y divide-border">{projects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised"><span><span className="block text-sm font-semibold">{project.name}</span><span className="mt-1 block text-xs capitalize text-text-tertiary">{PROJECT_STATUS_LABELS[project.status]} · {project.type}</span></span><span className="text-sm font-semibold text-accent">{project.progress}%</span></Link>)}</div>}</Panel></Page>
}
