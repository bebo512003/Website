'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Shared pager for server-side (database) pagination. Renders the row range,
 * prev/next buttons, and compact page numbers with ellipses. */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  pageNumbers = 3,
  showTotal = true,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  /** How many page numbers to show on each side of the current page. */
  pageNumbers?: number
  showTotal?: boolean
}) {
  if (total === 0) return null
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)

  const pages = new Set<number>()
  for (let p = 1; p <= Math.min(pageNumbers, pageCount); p++) pages.add(p)
  for (let p = Math.max(1, current - pageNumbers); p <= Math.min(pageCount, current + pageNumbers); p++) pages.add(p)
  for (let p = Math.max(1, pageCount - pageNumbers + 1); p <= pageCount; p++) pages.add(p)
  const sorted = [...pages].sort((a, b) => a - b)

  const buttonClassName =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-surface px-2 text-xs font-medium text-text-secondary transition hover:border-line-light hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      {showTotal && (
        <p className="text-xs text-text-tertiary">
          Showing <span className="font-semibold text-fg">{from}–{to}</span> of{' '}
          <span className="font-semibold text-fg">{total}</span>
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={buttonClassName}
          onClick={() => onChange(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {sorted.map((p, index) => {
          const prev = sorted[index - 1]
          const gap = prev !== undefined && p - prev > 1
          return (
            <span key={p} className="flex items-center gap-1.5">
              {gap && <span className="px-1 text-xs text-text-tertiary">…</span>}
              <button
                type="button"
                className={`${buttonClassName} ${p === current ? 'border-accent bg-accent/10 font-semibold text-accent' : ''}`}
                onClick={() => onChange(p)}
                aria-current={p === current ? 'page' : undefined}
              >
                {p}
              </button>
            </span>
          )
        })}
        <button
          type="button"
          className={buttonClassName}
          onClick={() => onChange(current + 1)}
          disabled={current >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
