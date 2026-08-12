import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import type { Database, Json, Profile, ProfileStatus } from '@/lib/supabase/types'
import { flushEmailQueue } from '@/lib/email/flush'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Far beyond any practical password lifetime; GoTrue treats the account as
// banned until an administrator explicitly lifts it.
const DEACTIVATION_BAN_DURATION = '876600h'

type ClientAccountRequest = {
  password?: unknown
  account?: Record<string, unknown>
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS })
}

/**
 * Temporary passwords are generated on the server, shown to the administrator
 * exactly once in the creation response, and never persisted anywhere: the Auth
 * user stores only its hash. base64url over 18 random bytes ≈ 144 bits entropy.
 */
function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url')
}

function getConfiguration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return supabaseUrl && supabaseAnonKey && serviceRoleKey
    ? { supabaseUrl, supabaseAnonKey, serviceRoleKey }
    : null
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function createRequestClients(configuration: NonNullable<ReturnType<typeof getConfiguration>>, token: string) {
  return {
    callerClient: createClient<Database>(configuration.supabaseUrl, configuration.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    serviceClient: createClient<Database>(configuration.supabaseUrl, configuration.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  }
}

async function verifyCaller(callerClient: ReturnType<typeof createRequestClients>['callerClient'], token: string) {
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
  if (callerError || !callerData.user) return { error: errorResponse('Your session is invalid or has expired.', 401) }
  return { userId: callerData.user.id }
}

async function verifyAdmin(callerClient: ReturnType<typeof createRequestClients>['callerClient'], token: string) {
  const caller = await verifyCaller(callerClient, token)
  if ('error' in caller) return caller

  const { data: permissions, error: permissionsError } = await callerClient.rpc('get_user_permissions')
  if (permissionsError) return { error: errorResponse('Unable to verify permissions.', 403) }
  if (!permissions.includes('admin.manage')) {
    return { error: errorResponse('You do not have permission to manage client portal accounts.', 403) }
  }

  return caller
}

/**
 * Keeps Supabase Auth sign-in ability in sync with the profile status.
 * Deactivated clients are rejected at login (and on token refresh) in addition
 * to losing portal access through the portal RPCs. Best effort: the
 * database-level blocks remain authoritative if the GoTrue call fails.
 */
async function syncAuthAccessBan(
  serviceClient: ReturnType<typeof createRequestClients>['serviceClient'],
  userId: string,
  status: ProfileStatus,
) {
  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    ban_duration: status === 'inactive' ? DEACTIVATION_BAN_DURATION : 'none',
  })
  if (error) {
    console.error(`Unable to sync the Auth access ban for ${userId}: ${error.message}`)
  }
  return !error
}

function parseAccount(account: Record<string, unknown>) {
  const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : ''
  const fullName = typeof account.full_name === 'string' ? account.full_name.trim() : ''
  const clientId = typeof account.client_id === 'string' && UUID_PATTERN.test(account.client_id)
    ? account.client_id
    : null

  if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) return { error: errorResponse('A valid email address is required.', 400) }
  if (!clientId) return { error: errorResponse('A valid client record identifier is required.', 400) }

  return {
    email,
    fullName,
    clientId,
    status: (account.status === 'inactive' ? 'inactive' : 'active') as ProfileStatus,
  }
}

function friendlyAuthCreateError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return 'An account with this email already exists.'
  }
  if (normalized.includes('password')) {
    return 'The generated temporary password was rejected by the authentication service.'
  }
  return message
}

/**
 * Invites a client to the portal: creates the CRM-linked client profile
 * placeholder, then provisions the real Auth login with a temporary password.
 *
 * The service-role key is used only after the caller's JWT has been verified and
 * the database confirms the caller has `admin.manage`. It must never be moved to
 * a NEXT_PUBLIC environment variable or returned to the browser.
 */
export async function POST(request: Request) {
  const configuration = getConfiguration()
  if (!configuration) return errorResponse('Client account provisioning is not configured on the server.', 503)

  const token = getBearerToken(request)
  if (!token) return errorResponse('Authentication required.', 401)

  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return errorResponse('Invalid request body.', 400)

  const body = parsedBody as ClientAccountRequest
  const account = body.account
  if (!account || typeof account !== 'object' || Array.isArray(account)) return errorResponse('Client account details are required.', 400)

  const parsed = parseAccount(account)
  if ('error' in parsed) return parsed.error

  const { callerClient, serviceClient } = createRequestClients(configuration, token)
  const authorization = await verifyAdmin(callerClient, token)
  if ('error' in authorization) return authorization.error

  // Create the permission-checked placeholder first. The auth.users trigger will
  // atomically claim it by e-mail when the trusted server creates the Auth user.
  const { data: placeholder, error: placeholderError } = await callerClient.rpc('admin_create_client_account', {
    p_client_id: parsed.clientId,
    p_email: parsed.email,
    p_full_name: parsed.fullName || null,
    p_status: parsed.status,
  })
  if (placeholderError || !placeholder) {
    const message = placeholderError?.message || 'Unable to create the client account profile.'
    const duplicate = message.toLowerCase().includes('already exists')
    return errorResponse(message, duplicate ? 409 : 400)
  }

  const cleanupPlaceholder = async () => {
    await serviceClient.from('profiles').delete().eq('id', placeholder.id)
  }

  const temporaryPassword = generateTemporaryPassword()
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: parsed.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: parsed.fullName },
    app_metadata: {
      agency_os_admin_provisioned: true,
      agency_os_provisioned_by: authorization.userId,
    },
  })

  if (createError || !created.user) {
    await cleanupPlaceholder()
    return errorResponse(friendlyAuthCreateError(createError?.message || 'Unable to create the login account.'), 409)
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', created.user.id)
    .single()

  if (profileError || !profile) {
    await serviceClient.auth.admin.deleteUser(created.user.id)
    await cleanupPlaceholder()
    return errorResponse('The login could not be linked to its client profile. No account was kept.', 500)
  }

  // Transactional email: portal invitation. The payload deliberately contains
  // no credentials — the temporary password is shown to the administrator once
  // above and shared out-of-band. Dedupe key prevents repeat invites from
  // spamming the same account.
  const { error: inviteEmailError } = await serviceClient.from('email_outbox').insert({
    template_key: 'client-invitation',
    recipient_email: parsed.email,
    recipient_user_id: profile.id,
    payload: {
      client_name: parsed.fullName || undefined,
      portal_path: '/auth',
    },
    dedupe_key: `client.invitation:${profile.id}`,
    status: 'queued',
    next_attempt_at: new Date().toISOString(),
  })
  if (inviteEmailError && inviteEmailError.code !== '23505') {
    console.error('[email] client invitation enqueue failed:', inviteEmailError.message)
  }

  // Best-effort immediate flush; the scheduled /api/cron/emails job is the guarantee.
  void flushEmailQueue().catch((error) => {
    console.error('[email] immediate flush failed:', error)
  })

  return Response.json(
    { data: profile as Profile, temporary_password: temporaryPassword },
    { status: 201, headers: NO_STORE_HEADERS },
  )
}

/**
 * Updates a client portal account while keeping auth.users.email and
 * profiles.email in sync. Status-only changes go through the permission-checked
 * set_user_status RPC and then sync the Supabase Auth ban.
 */
export async function PATCH(request: Request) {
  const configuration = getConfiguration()
  if (!configuration) return errorResponse('Client account management is not configured on the server.', 503)

  const token = getBearerToken(request)
  if (!token) return errorResponse('Authentication required.', 401)

  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return errorResponse('Invalid request body.', 400)

  const body = parsedBody as ClientAccountRequest
  const account = body.account
  if (!account || typeof account !== 'object' || Array.isArray(account)) return errorResponse('Client account details are required.', 400)

  const userId = typeof account.id === 'string' && UUID_PATTERN.test(account.id) ? account.id : ''
  if (!userId) return errorResponse('A valid client account identifier is required.', 400)

  const { callerClient, serviceClient } = createRequestClients(configuration, token)
  const authorization = await verifyCaller(callerClient, token)
  if ('error' in authorization) return authorization.error

  // ── Status-only toggle: permission-checked RPC + Auth ban synchronization ──
  const statusOnly = typeof account.status === 'string'
    && account.email === undefined
    && account.full_name === undefined
    && account.client_id === undefined
  if (statusOnly) {
    const newStatus = account.status === 'inactive' ? 'inactive' : 'active'
    const { data: updated, error: statusError } = await callerClient.rpc('set_user_status', {
      target_user_id: userId,
      new_status: newStatus,
    })
    if (statusError || !updated) {
      return errorResponse(statusError?.message || 'Unable to update the client account status.', 403)
    }
    await syncAuthAccessBan(serviceClient, userId, newStatus)
    return Response.json({ data: updated as Profile }, { status: 200, headers: NO_STORE_HEADERS })
  }

  const admin = await verifyAdmin(callerClient, token)
  if ('error' in admin) return admin.error

  const parsed = parseAccount(account)
  if ('error' in parsed) return parsed.error

  const { data: currentAuth, error: currentAuthError } = await serviceClient.auth.admin.getUserById(userId)
  if (currentAuthError || !currentAuth.user) return errorResponse('The client Auth account was not found.', 404)

  const previousEmail = currentAuth.user.email || ''
  const previousFullName = typeof currentAuth.user.user_metadata?.full_name === 'string'
    ? currentAuth.user.user_metadata.full_name
    : ''

  const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(userId, {
    email: parsed.email,
    user_metadata: { ...currentAuth.user.user_metadata, full_name: parsed.fullName },
  })
  if (authUpdateError) return errorResponse(authUpdateError.message, 400)

  const { data: profile, error: profileError } = await callerClient.rpc('admin_update_client_account', {
    p_user_id: userId,
    p_email: parsed.email,
    p_full_name: parsed.fullName || null,
    p_client_id: parsed.clientId,
  })

  if (profileError || !profile) {
    await serviceClient.auth.admin.updateUserById(userId, {
      email: previousEmail || undefined,
      user_metadata: { ...currentAuth.user.user_metadata, full_name: previousFullName },
    })
    return errorResponse(profileError?.message || 'Unable to update the client account.', 400)
  }

  await syncAuthAccessBan(serviceClient, userId, profile.status)

  return Response.json({ data: profile as Profile }, { status: 200, headers: NO_STORE_HEADERS })
}

/**
 * Revokes a client's portal access entirely. The permission-checked RPC deletes
 * both the profile and the Auth login atomically.
 */
export async function DELETE(request: Request) {
  const configuration = getConfiguration()
  if (!configuration) return errorResponse('Client account management is not configured on the server.', 503)

  const token = getBearerToken(request)
  if (!token) return errorResponse('Authentication required.', 401)

  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return errorResponse('Invalid request body.', 400)

  const body = parsedBody as ClientAccountRequest
  const account = body.account
  if (!account || typeof account !== 'object' || Array.isArray(account)) return errorResponse('Client account details are required.', 400)

  const userId = typeof account.id === 'string' && UUID_PATTERN.test(account.id) ? account.id : ''
  if (!userId) return errorResponse('A valid client account identifier is required.', 400)

  const { callerClient } = createRequestClients(configuration, token)
  const admin = await verifyAdmin(callerClient, token)
  if ('error' in admin) return admin.error

  const { data, error } = await callerClient.rpc('admin_delete_client_account', { p_user_id: userId })
  if (error) return errorResponse(error.message, 403)
  if (!data) return errorResponse('Unable to remove the client account.', 400)

  return Response.json({ data: true as unknown as Json }, { status: 200, headers: NO_STORE_HEADERS })
}
