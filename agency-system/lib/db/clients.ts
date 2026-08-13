/**
 * clients repository — data access for the clients domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok, PageQuery, PageResult, pagedFail, escapeFilterValue, executePage } from './shared'
import { setProfileStatus } from './team'
import type { Client, ClientInsert, ClientUpdate, Profile, ProfileStatus } from '../supabase/types'
// Client account management (Admin only). Mirrors the team-member account

// provisioning flow but for portal accounts linked to a CRM client record.

export type ClientAccountPayload = {
  client_id: string
  email: string
  full_name?: string | null
  status?: ProfileStatus
}


export type ClientAccountUpdatePayload = Partial<ClientAccountPayload> & { id: string }


export async function getClientAccounts(): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('full_name')
  return error ? fail([], error.message) : ok((data as Profile[]) || [])
}


export async function getClientAccountsByClientId(clientId: string): Promise<Result<Profile[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .eq('client_id', clientId)
    .order('created_at')
  return error ? fail([], error.message) : ok((data as Profile[]) || [])
}


export async function createClientAccount(payload: ClientAccountPayload): Promise<Result<{ profile: Profile; temporaryPassword: string } | null>> {
  if (!supabase) return fail(null)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: payload }),
      cache: 'no-store',
    })
    const result = await response.json() as { data?: Profile; temporary_password?: string; error?: string }
    if (!response.ok || !result.data || !result.temporary_password) {
      return fail(null, result.error || 'Unable to create the client portal account.')
    }
    return ok({ profile: result.data, temporaryPassword: result.temporary_password })
  } catch {
    return fail(null, 'Unable to reach the account provisioning service.')
  }
}


export async function setClientAccountStatus(userId: string, status: ProfileStatus): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: { id: userId, status } }),
      cache: 'no-store',
    })
    if (response.status === 503) return setProfileStatus(userId, status)
    const result = await response.json() as { data?: Profile; error?: string }
    if (!response.ok || !result.data) return fail(null, result.error || 'Unable to update the client account status.')
    return ok(result.data)
  } catch {
    return setProfileStatus(userId, status)
  }
}


export async function updateClientAccount(payload: ClientAccountUpdatePayload): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)

  if (payload.email === undefined && payload.client_id === undefined && payload.status !== undefined) {
    return setClientAccountStatus(payload.id, payload.status)
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(null, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: payload }),
      cache: 'no-store',
    })
    const result = await response.json() as { data?: Profile; error?: string }
    if (!response.ok || !result.data) return fail(null, result.error || 'Unable to update the client portal account.')
    return ok(result.data)
  } catch {
    return fail(null, 'Unable to reach the account management service.')
  }
}


export async function deleteClientAccount(userId: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return fail(false, 'Your session has expired. Please login again.')

  try {
    const response = await fetch('/api/admin/client-accounts', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account: { id: userId } }),
      cache: 'no-store',
    })
    if (response.status === 503) {
      const { error } = await supabase.rpc('admin_delete_client_account', { p_user_id: userId })
      return error ? fail(false, error.message) : ok(true)
    }
    const result = await response.json() as { data?: boolean; error?: string }
    if (!response.ok) return fail(false, result.error || 'Unable to remove the client portal account.')
    return ok(true)
  } catch {
    return fail(false, 'Unable to reach the account management service.')
  }
}

export async function getClients(): Promise<Result<Client[]>> {
  if (!supabase) return fail([])
  const { data, error } = await supabase.from('clients').select('*').order('name')
  return error ? fail([], error.message) : ok((data || []) as unknown as Client[])
}


export type ClientListFilter = {
  search?: string
  status?: 'all' | Client['status']
  type?: 'all' | Client['type']
  sort?: 'name' | 'newest' | 'oldest'
}


/** Server-side search, filters, sort, and pagination for the clients
 * directory. Only one page of rows is transferred to the browser. */

export async function getClientsPage(
  filter: ClientListFilter & PageQuery = {}
): Promise<PageResult<Client>> {
  if (!supabase) return pagedFail(filter.page || 1, filter.pageSize || 24)
  const { page = 1, pageSize = 24, sort = 'name' } = filter
  let query = supabase.from('clients').select('*', { count: 'exact' })

  const q = escapeFilterValue(filter.search || '')
  if (q) {
    query = query.or(
      `name.ilike.*${q}*,industry.ilike.*${q}*,contact_person.ilike.*${q}*,contact_position.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*,location.ilike.*${q}*,website.ilike.*${q}*`
    )
  }
  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)
  if (filter.type && filter.type !== 'all') query = query.eq('type', filter.type)

  if (sort === 'name') query = query.order('name')
  else if (sort === 'oldest') query = query.order('created_at', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  return executePage<Client>(query, page, pageSize)
}

export async function getClientById(id: string): Promise<Result<Client | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  return error ? fail(null, error.message) : ok(data as unknown as Client | null)
}

export async function createClient(client: ClientInsert): Promise<Result<Client | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('clients').insert(client).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as Client | null)
}

export async function updateClient(id: string, updates: ClientUpdate): Promise<Result<Client | null>> {
  if (!supabase) return fail(null)
  const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
  return error ? fail(null, error.message) : ok(data as unknown as Client | null)
}

export async function deleteClient(id: string): Promise<Result<boolean>> {
  if (!supabase) return fail(false)
  const { error } = await supabase.from('clients').delete().eq('id', id)
  return error ? fail(false, error.message) : ok(true)
}
