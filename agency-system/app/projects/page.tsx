import { FolderKanban } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function ProjectsPage() {
  return <Page><PageHeader eyebrow="PROJECTS / PORTFOLIO" title="Projects" description="Projects are loaded securely from Supabase according to your role and assignments." /><Panel><EmptyState icon={FolderKanban} title="No projects loaded" description="There is no demo content. Authorized projects will appear here after they are created and assigned." /></Panel></Page>
}
