import { Bell } from 'lucide-react'
import { EmptyState, Page, PageHeader, Panel } from '@/components/ui/page'

export default function NotificationsPage() {
  return <Page><PageHeader eyebrow="NOTIFICATIONS / INBOX" title="Notifications" description="Your account notifications will appear here." /><Panel><EmptyState icon={Bell} title="No notifications" description="There are no demonstration alerts in this workspace." /></Panel></Page>
}
