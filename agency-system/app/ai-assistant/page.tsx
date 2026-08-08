import { Bot } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function AIAssistantPage() {
  return <Page><PageHeader eyebrow="AI / INTEGRATION" title="AI Assistant" description="No AI provider is configured for this workspace." /><Panel><EmptyState icon={Bot} title="AI integration is not configured" description="This screen intentionally contains no simulated conversations or generated demo responses." /></Panel></Page>
}
