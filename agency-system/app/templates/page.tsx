import { LayoutTemplate } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function TemplatesPage() {
  return <Page><PageHeader eyebrow="TEMPLATES / LIBRARY" title="Templates" description="Reusable workspace templates will be listed here." /><Panel><EmptyState icon={LayoutTemplate} title="No templates configured" description="Create a template source before using this library." /></Panel></Page>
}
