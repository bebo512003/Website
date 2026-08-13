import Link from 'next/link'
import { ArrowLeft, ArrowRight, ClipboardList, Layers3, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import { getCachedPublishedForms } from '@/lib/supabase/public-server'
import { PublishedFormCard } from '@/components/public/published-form-card'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'
import { pageMetadata } from '@/lib/site'

export const revalidate = 120

export const metadata: Metadata = pageMetadata({
  title: 'Request a New Project — Agency OS',
  description: 'Choose a published project request form and submit your brief without creating an account.',
  path: '/forms',
})

const HEADING = 'AGENCY OS / REQUEST A PROJECT'

export default async function PublicFormsPage() {
  const { data: forms, error } = await getCachedPublishedForms()

  return (
    <div className="min-h-screen overflow-hidden bg-bg text-fg">
      <PublicSiteHeader />

      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-text-secondary transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>

        <div className="mt-8">
          <p className="mb-4 flex items-center gap-3 font-mono-tech text-[10px] tracking-[0.28em] text-accent">
            <span className="h-px w-10 bg-accent" /> {HEADING}
          </p>
          <h1 className="font-display text-5xl leading-none tracking-tight text-fg sm:text-6xl">
            Request a New Project
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
            Pick the form that best describes what you need. Fill it out — no account required.
            We will review your request and reach out with the next step.
          </p>
          <ol className="mt-7 grid max-w-2xl grid-cols-3 gap-2" aria-label="Request steps">
            {['Select form', 'Fill form', 'Submit'].map((label, index) => (
              <li key={label} className={`border-t-2 pt-2 text-[10px] sm:text-xs ${index === 0 ? 'border-accent font-semibold text-fg' : 'border-border text-text-tertiary'}`}>
                <span className="mr-1 font-mono-tech">0{index + 1}</span> {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10">
          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-400">
              {error}
            </div>
          ) : forms.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-raised">
                <ClipboardList className="h-5 w-5 text-text-tertiary" />
              </div>
              <h3 className="text-base font-semibold text-fg">No forms available yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Our team hasn&apos;t published any structured forms right now. Check back soon or browse our portfolio while you wait.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-fg transition hover:border-line-light">
                  <ArrowLeft className="h-4 w-4" /> Back to home
                </Link>
                <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
                  <Layers3 className="h-4 w-4" /> View portfolio
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-6 text-sm text-text-secondary">
                {forms.length} form{forms.length === 1 ? '' : 's'} available. Select one to get started.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {forms.map((form) => (
                  <PublishedFormCard key={form.id} form={form} />
                ))}
              </div>

              <div className="mt-10 rounded-md border border-border bg-surface p-6">
                <div className="flex items-start gap-4">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold text-fg">How it works</h3>
                    <ol className="mt-3 space-y-2 text-sm text-text-secondary">
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">1</span>
                        Select the form that matches your needs
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">2</span>
                        Fill out the questions — no account required
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">3</span>
                        Submit and we will review your request
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">4</span>
                        We reach out with next steps
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 rounded-md border border-border bg-surface-raised p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-fg">Already submitted a request?</h3>
                <p className="text-xs text-text-secondary">Check the live progress of your submission anytime with your reference number.</p>
              </div>
            </div>
            <Link
              href="/track"
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-fg transition hover:border-line-light hover:text-accent"
            >
              Track request status <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-8">
          <p className="text-sm text-text-secondary">
            Want to see our work first?{' '}
            <Link href="/portfolio" className="font-medium text-accent hover:underline">
              Browse our portfolio →
            </Link>
          </p>
        </div>
      </div>

      <PublicSiteFooter />
    </div>
  )
}
