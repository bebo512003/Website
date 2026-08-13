/**
 * shared repository — data access for the shared domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
export interface Result<T> {
  data: T
  error: string | null
}


export const notConfigured = 'Supabase is not configured.'

export const fail = <T>(data: T, message = notConfigured): Result<T> => ({ data, error: message })

export const ok = <T>(data: T): Result<T> => ({ data, error: null })


// ── Server-side pagination (Session 23) ─────────────────────────────────────

// Large collections are filtered, sorted, and paged in the database — the

// browser only ever receives one page of rows plus the exact total count.


export type PageQuery = {
  /** 1-based page number. */
  page?: number
  /** Rows per page (clamped to 1..100 server-side). */
  pageSize?: number
}


export type PageResult<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
  error: string | null
}


export const pagedFail = <T>(page: number, pageSize: number, message = notConfigured): PageResult<T> => ({
  data: [],
  total: 0,
  page,
  pageSize,
  error: message,
})


/** Sanitizes a user search term for PostgREST `.or()` filter syntax: the
 * wildcard and list-delimiter characters are stripped so the term is treated
 * as a literal substring everywhere it is interpolated. */

export function escapeFilterValue(value: string): string {
  return value.replace(/[*%,()]/g, '').trim()
}


/** A Supabase query builder that has been started with
 * `.select(cols, { count: 'exact' })` — structurally typed so we do not depend
 * on the versioned PostgREST builder generics. */

type CountableRangeQuery = {
  range: (from: number, to: number) => PromiseLike<{
    data: unknown
    count: number | null
    error: { message: string } | null
  }>
}


/** Applies count + range to an already-built Supabase query and normalizes the
 * result into a PageResult. */

export async function executePage<T>(
  query: CountableRangeQuery,
  page: number,
  pageSize: number
): Promise<PageResult<T>> {
  if (!supabase) return pagedFail(page, pageSize)
  const safePage = Math.max(1, Math.floor(page) || 1)
  const safeSize = Math.min(Math.max(1, Math.floor(pageSize) || 25), 100)
  const from = (safePage - 1) * safeSize
  const { data, count, error } = await query.range(from, from + safeSize - 1)
  if (error) return { data: [], total: 0, page: safePage, pageSize: safeSize, error: error.message }
  return {
    data: (data || []) as unknown as T[],
    total: count ?? 0,
    page: safePage,
    pageSize: safeSize,
    error: null,
  }
}



