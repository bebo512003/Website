import { Users } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function ClientDetailPage() {
  return <Page><PageHeader eyebrow="CLIENTS / DETAIL" title="Client" description="Client information is loaded from Supabase." /><Panel><EmptyState icon={Users} title="Client data is not loaded" description="Return to Clients and select an available record." /></Panel></Page>
}
