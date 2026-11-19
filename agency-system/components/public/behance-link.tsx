import { ArrowUpRight } from 'lucide-react'
import { SITE_CONTACT } from '@/lib/contact'
import { secondaryButtonClassName } from '@/components/ui/page'
import { cn } from '@/lib/utils'

export function BehanceLink({ className, label = 'View work on Behance' }: { className?: string; label?: string }) {
  return (
    <a href={SITE_CONTACT.behance} target="_blank" rel="noopener noreferrer" className={cn(secondaryButtonClassName, className)}>
      {label} <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
    </a>
  )
}
