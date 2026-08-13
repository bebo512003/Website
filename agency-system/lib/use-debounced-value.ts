'use client'

import { useEffect, useState } from 'react'

/** Returns `value` after it has stayed unchanged for `delay` ms. Used to keep
 * server-side search queries from firing on every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
