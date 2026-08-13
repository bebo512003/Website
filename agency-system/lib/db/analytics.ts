/**
 * analytics repository — data access for the analytics domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok } from './shared'
import type { OperationalAnalytics } from '../supabase/types'
/** One database-aggregated operational report. The RPC applies report.view,
 * account-state, submission, and project-access checks before returning data. */

export async function getOperationalAnalytics(days = 30): Promise<Result<OperationalAnalytics | null>> {
  if (!supabase) return fail(null)
  const safeDays = Math.min(365, Math.max(7, Math.floor(days) || 30))
  const { data, error } = await supabase.rpc('get_operational_analytics', { p_days: safeDays })
  return error ? fail(null, error.message) : ok(data as unknown as OperationalAnalytics)
}

