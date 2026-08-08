import { BarChart3 } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function ReportsPage() {
  return <Page><PageHeader eyebrow="REPORTS / LIVE DATA" title="Reports" description="Reports are calculated from records your role is authorized to read." /><Panel><EmptyState icon={BarChart3} title="No report data" description="Metrics will appear after your workspace has projects and tasks." /></Panel></Page>
}
