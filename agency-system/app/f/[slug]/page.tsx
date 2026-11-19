import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCachedPublishedFormBySlug, getCachedPublishedForms } from '@/lib/supabase/public-server'
import { pageMetadata, SITE_NAME, truncateMeta } from '@/lib/site'
import { PublicFormClient } from './public-form-client'

export const revalidate = 120

export async function generateStaticParams() {
  const { data } = await getCachedPublishedForms()
  return data.map((form) => ({ slug: form.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { template } = await getCachedPublishedFormBySlug(slug)
  if (!template) {
    return pageMetadata({
      title: `Form not found — ${SITE_NAME}`,
      description: 'This project request form is not available.',
      path: `/f/${slug}`,
      noIndex: true,
    })
  }
  return pageMetadata({
    title: `${template.title} — ${SITE_NAME}`,
    description: truncateMeta(template.description) || `Complete the ${template.title} form without creating an account.`,
    path: `/f/${template.slug}`,
  })
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { template, questions } = await getCachedPublishedFormBySlug(slug)
  if (!template) notFound()
  return <PublicFormClient template={template} questions={questions} />
}
