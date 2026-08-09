'use client'

/* Portfolio assets are private Supabase signed URLs; using plain img keeps the storage URL dynamic. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, ExternalLink, ImageIcon, Layers3, LoaderCircle } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getPublicPortfolioProjectBySlug } from '@/lib/supabase/database'
import type { PortfolioProjectWithRelations } from '@/lib/supabase/types'

function coverImage(project: PortfolioProjectWithRelations) {
  if (project.cover_image_path) return project.portfolio_project_images.find((image) => image.storage_path === project.cover_image_path)?.image_url || null
  return project.portfolio_project_images[0]?.image_url || null
}

export function PortfolioProjectPage() {
  const params = useParams<{ slug: string }>()
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug
  const [project, setProject] = useState<PortfolioProjectWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!slug) return
    const result = await getPublicPortfolioProjectBySlug(slug)
    setProject(result.data)
    setError(result.error || '')
    setLoading(false)
  }, [slug])

  useEffect(() => { void load() }, [load])

  const gallery = useMemo(() => {
    if (!project) return []
    const cover = coverImage(project)
    const ordered = project.portfolio_project_images.filter((image) => image.image_url)
    if (!cover) return ordered
    const coverRecord = ordered.find((image) => image.image_url === cover)
    return coverRecord ? [coverRecord, ...ordered.filter((image) => image.id !== coverRecord.id)] : ordered
  }, [project])

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#080808] text-sm text-white/50"><LoaderCircle className="mr-3 h-5 w-5 animate-spin text-accent" />Loading project…</main>
  }

  if (error || !project) {
    return <main className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-5 text-center text-white"><div className="mb-5 flex h-12 w-12 items-center justify-center border border-white/15 bg-white/[0.04]"><ImageIcon className="h-5 w-5 text-accent" /></div><p className="font-mono-tech text-[10px] text-accent">404 / PROJECT NOT FOUND</p><h1 className="mt-4 font-display text-6xl">NOT PUBLIC YET.</h1><p className="mt-4 max-w-md text-sm leading-6 text-white/45">This project may be unpublished, archived, or the link may be incorrect.</p><Link href="/portfolio" className="mt-8 inline-flex items-center gap-2 border border-white/20 px-4 py-3 text-sm font-semibold hover:border-accent"><ArrowLeft className="h-4 w-4" /> Back to portfolio</Link></main>
  }

  const heroImage = coverImage(project)

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10 bg-[#080808]/95 px-5 py-5 backdrop-blur sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl items-center justify-between"><Link href="/portfolio" className="flex items-center gap-3 text-white/70 transition hover:text-white"><span className="flex h-9 w-9 items-center justify-center border border-white/20 text-accent"><Layers3 className="h-4 w-4" /></span><span className="text-sm font-bold tracking-[0.22em]">AGENCY OS</span></Link><Link href="/forms" className="inline-flex items-center gap-2 border border-accent bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition hover:brightness-110">Start a project <ArrowUpRight className="h-3.5 w-3.5" /></Link></div></header>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 lg:px-10 lg:pt-12">
        <Link href="/portfolio" className="inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-accent"><ArrowLeft className="h-3.5 w-3.5" /> Back to all work</Link>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-20">
          <div><p className="flex items-center gap-3 font-mono-tech text-[10px] text-accent"><span className="h-px w-8 bg-accent" />{project.portfolio_categories?.name || 'Selected work'}</p><h1 className="mt-5 max-w-4xl font-display text-7xl leading-[0.82] tracking-tight sm:text-9xl">{project.title}</h1></div>
          <div className="lg:pb-2"><p className="text-base leading-7 text-white/55">{project.description || 'A considered visual system created with clarity, intention, and attention to every detail.'}</p>{project.external_url && <a href={project.external_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-white">View external project <ExternalLink className="h-4 w-4" /></a>}</div>
        </div>

        <div className="mt-12 border border-white/10 bg-white/[0.035] p-2 sm:mt-16 sm:p-3">{heroImage ? <img src={heroImage} alt={project.title} className="max-h-[72vh] w-full object-cover" /> : <div className="flex min-h-72 items-center justify-center bg-gradient-to-br from-surface-raised via-surface-overlay to-accent/20"><ImageIcon className="h-10 w-10 text-white/30" /></div>}</div>

        <div className="mt-12 grid gap-10 border-b border-white/10 pb-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20"><div><p className="font-mono-tech text-[10px] text-accent">PROJECT INFORMATION</p><dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 text-sm"><div><dt className="text-xs text-white/35">Client / brand</dt><dd className="mt-1 font-medium text-white/80">{project.client_name || 'Confidential'}</dd></div><div><dt className="text-xs text-white/35">Date</dt><dd className="mt-1 font-medium text-white/80">{project.project_date ? new Date(`${project.project_date}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'Not specified'}</dd></div><div className="col-span-2"><dt className="text-xs text-white/35">Services</dt><dd className="mt-2 flex flex-wrap gap-2">{project.services.length ? project.services.map((service) => <span key={service} className="border border-white/15 px-2.5 py-1 text-xs text-white/65">{service}</span>) : <span className="text-white/50">Creative direction and design</span>}</dd></div></dl></div><div className="max-w-2xl"><p className="text-lg leading-8 text-white/72 sm:text-xl">{project.description || 'Every project is an opportunity to make a clear point of view visible.'}</p></div></div>

        {gallery.length > 1 && <section className="mt-12"><div className="mb-6 flex items-end justify-between"><div><p className="font-mono-tech text-[10px] text-accent">PROJECT GALLERY</p><h2 className="mt-2 font-display text-5xl">DETAILS.</h2></div><span className="text-xs text-white/35">{gallery.length} images</span></div><div className="grid gap-4 sm:grid-cols-2">{gallery.slice(1).map((image) => <div key={image.id} className="overflow-hidden border border-white/10 bg-white/[0.035]"><img src={image.image_url!} alt={image.alt_text || project.title} className="h-full w-full object-cover" /></div>)}</div></section>}

        <section className="mt-20 border-t border-white/10 pt-10"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><p className="font-mono-tech text-[10px] text-accent">NEXT PROJECT</p><p className="mt-2 text-sm text-white/45">Like what you see? Let&apos;s make something with intent.</p></div><Link href="/forms" className="inline-flex items-center justify-center gap-2 border border-accent bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">Start a conversation <ArrowUpRight className="h-4 w-4" /></Link></div></section>
      </div>
    </main>
  )
}
