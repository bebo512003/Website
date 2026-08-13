import Image from 'next/image'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PortfolioImage({
  src,
  alt,
  priority = false,
  sizes,
  className,
  fill = true,
}: {
  src: string | null | undefined
  alt: string
  priority?: boolean
  sizes: string
  className?: string
  fill?: boolean
}) {
  if (!src) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-raised via-surface-overlay to-accent/20', className)}>
        <ImageIcon className="h-8 w-8 text-white/30" strokeWidth={1} aria-hidden />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      priority={priority}
      loading={priority ? 'eager' : 'lazy'}
      className={cn('object-cover', className)}
    />
  )
}
