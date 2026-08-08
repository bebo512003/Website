import { FolderKanban } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function ProjectDetailPage() {
  return <Page><PageHeader eyebrow="PROJECTS / DETAIL" title="Project" description="Project details are protected by role and assignment policies." /><Panel><EmptyState icon={FolderKanban} title="Project data is not loaded" description="Return to Projects and choose a project you are authorized to view." /></Panel></Page>
}
