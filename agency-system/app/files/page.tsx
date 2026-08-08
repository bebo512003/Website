import { FileText } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function FilesPage() {
  return <Page><PageHeader eyebrow="FILES / STORAGE" title="Files" description="Files are stored in Supabase Storage and filtered by project access." /><Panel><EmptyState icon={FileText} title="No files yet" description="There are no sample files. Upload a file from an authorized project." /></Panel></Page>
}
