import type { Metadata } from 'next'
import { ProjectDesk } from '@/components/forms/project-desk'
import { getCachedPublishedForms } from '@/lib/supabase/public-server'
import { pageMetadata, PROJECT_DESK_PATH, SITE_NAME } from '@/lib/site'

export const revalidate = 120

export const metadata: Metadata = pageMetadata({
  title: `Project desk — ${SITE_NAME}`,
  description: 'Share a project brief or check the status of a request you already sent. No account required.',
  path: PROJECT_DESK_PATH,
})

export default async function PublicFormsPage() {
  const { data: forms, error } = await getCachedPublishedForms()
  return <ProjectDesk forms={forms} catalogUnavailable={Boolean(error)} />
}
