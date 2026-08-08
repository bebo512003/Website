import { Users } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function ClientsPage() {
  return <Page><PageHeader eyebrow="CLIENTS / DIRECTORY" title="Clients" description="Client records are read from the secured workspace database." /><Panel><EmptyState icon={Users} title="No clients yet" description="There is no sample client data. Administrators and managers can add the first client." /></Panel></Page>
}
