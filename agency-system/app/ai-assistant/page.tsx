import { Bot } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function AIAssistantPage() {
  return <Page><PageHeader eyebrow="AI / INTEGRATION" title="AI Assistant" description="No AI provider is configured for this workspace." /><Panel><EmptyState icon={Bot} title="AI integration is not configured" description="Connect an approved provider before starting a conversation." /></Panel></Page>
}
