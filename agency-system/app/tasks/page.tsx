import { CheckSquare } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function TasksPage() {
  return <Page><PageHeader eyebrow="TASKS / BOARD" title="Tasks" description="Tasks from the projects you can access will appear here." /><Panel><EmptyState icon={CheckSquare} title="No tasks yet" description="There are no sample tasks. Create tasks inside a project to begin." /></Panel></Page>
}
