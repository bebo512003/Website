'use client'

import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function PortfolioImage({
  src,
  alt,
  fallbackLabel,
  className,
  natural = false,
}: {
  src?: string | null
  alt: string
  fallbackLabel?: string
  className?: string
  natural?: boolean
}) {
  // A changed cover gets a fresh image state, even after the old URL failed.
  return <ImageFrame key={src} src={src} alt={alt} fallbackLabel={fallbackLabel} className={className} natural={natural} />
}

function ImageFrame({ src, alt, fallbackLabel, className, natural }: Parameters<typeof PortfolioImage>[0]) {
  const [failed, setFailed] = useState(false)
  const visible = Boolean(src && !failed)
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-surface-raised', !visible && 'min-h-24', className)}>
      {src && !failed ? (
        /* Uploaded images stay on the public-authorized image endpoint. The
           original Behance files also go straight to the browser, unmodified. */
        natural ? (
          // The intrinsic proportions of remote art are not known in advance.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} loading="lazy" decoding="async" className="mx-auto block h-auto max-w-full" onError={() => setFailed(true)} />
        ) : (
          <Image src={src} alt={alt} fill unoptimized className="object-contain" onError={() => setFailed(true)} />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
          <span className="font-display text-lg font-black tracking-tight text-text-tertiary">{fallbackLabel || 'Portfolio project'}</span>
          <span className="text-xs text-text-secondary">{src ? 'Image unavailable' : 'No cover image'}</span>
        </div>
      )}
    </div>
  )
}
