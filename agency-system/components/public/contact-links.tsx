import { ArrowUpRight, Briefcase, Mail, MessageCircle, Network, Phone } from 'lucide-react'
import { SITE_CONTACT_LINKS } from '@/lib/contact'
import { cn } from '@/lib/utils'

const icons = {
  email: Mail,
  phone: Phone,
  whatsapp: MessageCircle,
  behance: Briefcase,
  linkedin: Network,
}

export function ContactLinks({ lang = 'en', className }: { lang?: 'en' | 'ar'; className?: string }) {
  return (
    <ul className={cn('grid gap-1', className)}>
      {SITE_CONTACT_LINKS.map((channel) => {
        const Icon = icons[channel.key]
        return (
          <li key={channel.key} className="min-w-0">
            <a
              href={channel.href}
              target={channel.external ? '_blank' : undefined}
              rel={channel.external ? 'noopener noreferrer' : undefined}
              className="group flex w-fit max-w-full items-center gap-2 py-1.5 text-sm text-fg hover:underline hover:underline-offset-4"
            >
              <Icon className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 wrap-anywhere">
                {channel.value ? <><span className="sr-only">{channel[lang]}: </span><bdi dir="ltr">{channel.value}</bdi></> : channel[lang]}
              </span>
              {channel.external && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-secondary group-hover:text-fg rtl:-scale-x-100" aria-hidden="true" />}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
