import type { ComponentPropsWithoutRef } from 'react'
import Link from 'next/link'

/** Use browser fragment navigation for links to sections, including old redirect targets. */
export function PublicLink({ href, ...props }: ComponentPropsWithoutRef<'a'> & { href: string }) {
  return href.includes('#') ? <a href={href} {...props} /> : <Link href={href} {...props} />
}
