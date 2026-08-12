import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import type { Database, Json, Profile, ProfileStatus } from '@/lib/supabase/types'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Far beyond any practical password lifetime; GoTrue treats the account as
// banned until an administrator explicitly lifts it.
const DEACTIVATION_BAN_DURATION = '876600h'

type TeamMemberRequest = {
  password?: unknown
  member?: Record<string, unknown>
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS })
}

function optionalText(value: unknown, maxLength = 500) {
  if (typeof value !== 'string') return null
  // Keep an explicitly submitted empty string: admin_update_team_member uses it
  // to clear nullable fields via nullif(trim(value), ''). Missing values stay null.
  return value.trim().slice(0, maxLength)
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined
}

function cleanSocialLinks(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => key.length <= 50 && typeof item === 'string' && item.trim())
      .map(([key, item]) => [key, (item as string).trim().slice(0, 1000)]),
  )
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

async function verifyPermissions(
  callerClient: ReturnType<typeof createRequestClients>['callerClient'],
  token: string,
  required: string[],
) {
  const caller = await verifyCaller(callerClient, token)
  if ('error' in caller) return caller

  const { data: permissions, error: permissionsError } = await callerClient.rpc('get_user_permissions')
  if (permissionsError) return { error: errorResponse('Unable to verify permissions.', 403) }
  if (!required.some((key) => permissions.includes(key))) {
    return { error: errorResponse('You do not have permission to manage team accounts.', 403) }
  }

  return caller
}

/**
 * Keeps Supabase Auth sign-in ability in sync with the profile status.
 * Deactivated members are rejected at login (and on token refresh) in addition
 * to losing every permission through RLS. Best effort: the database-level
 * blocks remain authoritative if the GoTrue call fails.
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

function parseMember(member: Record<string, unknown>) {
  const email = typeof member.email === 'string' ? member.email.trim().toLowerCase() : ''
  const fullName = typeof member.full_name === 'string' ? member.full_name.trim() : ''
  const roleId = optionalUuid(member.role_id)
  const employeeRoleId = optionalUuid(member.employee_role_id)

  if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) return { error: errorResponse('A valid email address is required.', 400) }
  if (!fullName || fullName.length > 200) return { error: errorResponse('Full name is required.', 400) }
  if (roleId === undefined || employeeRoleId === undefined) return { error: errorResponse('Invalid role identifier.', 400) }

  return {
    email,
    fullName,
    roleId,
    employeeRoleId,
    status: (member.status === 'inactive' ? 'inactive' : 'active') as ProfileStatus,
    rpcArgs: {
      p_email: email,
      p_full_name: fullName,
      p_phone: optionalText(member.phone, 100),
      p_whatsapp: optionalText(member.whatsapp, 100),
      p_avatar_url: optionalText(member.avatar_url, 2000),
      p_job_title: optionalText(member.job_title, 200),
      p_department: optionalText(member.department, 200),
      p_specialization: optionalText(member.specialization, 300),
      p_bio: optionalText(member.bio, 5000),
      p_location: optionalText(member.location, 300),
      p_portfolio_url: optionalText(member.portfolio_url, 2000),
      p_social_links: cleanSocialLinks(member.social_links) as Json,
      p_role_id: roleId,
      p_employee_role_id: employeeRoleId,
      p_status: member.status === 'inactive' ? 'inactive' : 'active',
    },
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
 * Creates a real Supabase Auth user and its internal profile.
 *
 * The service-role key is used only after the caller's JWT has been verified and
 * the database confirms the caller has `employee.manage`. It must never be moved to
 * a NEXT_PUBLIC environment variable or returned to the browser.
 *
 * The temporary password is generated here, returned once in the response, and
 * never stored — a client-supplied password is ignored on purpose: internal
 * accounts always start from a system-generated credential.
 */
export async function POST(request: Request) {
  const configuration = getConfiguration()
  if (!configuration) return errorResponse('Team account provisioning is not configured on the server.', 503)

  const token = getBearerToken(request)
  if (!token) return errorResponse('Authentication required.', 401)

  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return errorResponse('Invalid request body.', 400)

  const body = parsedBody as TeamMemberRequest
  const member = body.member
  if (!member || typeof member !== 'object' || Array.isArray(member)) return errorResponse('Team member details are required.', 400)

  const parsedMember = parseMember(member)
  if ('error' in parsedMember) return parsedMember.error

  const { callerClient, serviceClient } = createRequestClients(configuration, token)
  const authorization = await verifyAdmin(callerClient, token)
  if ('error' in authorization) return authorization.error

  // Create the permission-checked placeholder first. The auth.users trigger will
  // atomically claim it by e-mail when the trusted server creates the Auth user.
  // admin_create_team_member rejects duplicate e-mails (including ones that only
  // exist in auth.users) before inserting, so a failed attempt leaves nothing to
  // clean up.
  const { data: placeholder, error: placeholderError } = await callerClient.rpc('admin_create_team_member', parsedMember.rpcArgs)
  if (placeholderError || !placeholder) {
    const message = placeholderError?.message || 'Unable to create the team member profile.'
    const duplicate = message.toLowerCase().includes('already exists')
    return errorResponse(message, duplicate ? 409 : 400)
  }

  const cleanupPlaceholder = async () => {
    await serviceClient.from('profiles').delete().eq('id', placeholder.id)
  }

  const temporaryPassword = generateTemporaryPassword()
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: parsedMember.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: parsedMember.fullName },
    app_metadata: {
      agency_os_admin_provisioned: true,
      agency_os_provisioned_by: authorization.userId,
    },
  })

  if (createError || !created.user) {
    // Never leave an orphaned placeholder behind a failed Auth creation.
    await cleanupPlaceholder()
    return errorResponse(friendlyAuthCreateError(createError?.message || 'Unable to create the login account.'), 409)
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', created.user.id)
    .single()

  if (profileError || !profile) {
    // Do not leave a login without its role/profile if database provisioning failed.
    await serviceClient.auth.admin.deleteUser(created.user.id)
    await cleanupPlaceholder()
    return errorResponse('The login could not be linked to its team profile. No account was kept.', 500)
  }

  return Response.json(
    { data: profile as Profile, temporary_password: temporaryPassword },
    { status: 201, headers: NO_STORE_HEADERS },
  )
}

/**
 * Updates a team member while keeping auth.users.email and profiles.email in sync.
 * Other profile fields remain permission-checked by admin_update_team_member().
 *
 * Also accepts a minimal `{ id, status }` payload: status changes go through the
 * permission-checked set_user_status RPC and then sync the Supabase Auth ban so
 * deactivated members cannot sign in at all.
 */
export async function PATCH(request: Request) {
  const configuration = getConfiguration()
  if (!configuration) return errorResponse('Team account management is not configured on the server.', 503)

  const token = getBearerToken(request)
  if (!token) return errorResponse('Authentication required.', 401)

  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return errorResponse('Invalid request body.', 400)

  const body = parsedBody as TeamMemberRequest
  const member = body.member
  if (!member || typeof member !== 'object' || Array.isArray(member)) return errorResponse('Team member details are required.', 400)

  const userId = typeof member.id === 'string' && UUID_PATTERN.test(member.id) ? member.id : ''
  if (!userId) return errorResponse('A valid team member identifier is required.', 400)

  const { callerClient, serviceClient } = createRequestClients(configuration, token)
  const authorization = await verifyCaller(callerClient, token)
  if ('error' in authorization) return authorization.error

  // ── Status-only toggle: permission-checked RPC + Auth ban synchronization ──
  const statusOnly = typeof member.status === 'string'
    && member.email === undefined
    && member.full_name === undefined
  if (statusOnly) {
    const newStatus = member.status === 'inactive' ? 'inactive' : 'active'
    const { data: updated, error: statusError } = await callerClient.rpc('set_user_status', {
      target_user_id: userId,
      new_status: newStatus,
    })
    if (statusError || !updated) {
      return errorResponse(statusError?.message || 'Unable to update the member status.', 403)
    }
    await syncAuthAccessBan(serviceClient, userId, newStatus)
    return Response.json({ data: updated as Profile }, { status: 200, headers: NO_STORE_HEADERS })
  }

  const { data: callerPermissions, error: permissionsError } = await callerClient.rpc('get_user_permissions')
  if (permissionsError) return errorResponse('Unable to verify permissions.', 403)
  if (!callerPermissions.includes('employee.manage')) return errorResponse('You do not have permission to manage team accounts.', 403)

  const parsedMember = parseMember(member)
  if ('error' in parsedMember) return parsedMember.error

  const { data: currentAuth, error: currentAuthError } = await serviceClient.auth.admin.getUserById(userId)
  if (currentAuthError || !currentAuth.user) return errorResponse('The team member Auth account was not found.', 404)

  const previousEmail = currentAuth.user.email || ''
  const previousFullName = typeof currentAuth.user.user_metadata?.full_name === 'string'
    ? currentAuth.user.user_metadata.full_name
    : ''

  const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(userId, {
    email: parsedMember.email,
    user_metadata: { ...currentAuth.user.user_metadata, full_name: parsedMember.fullName },
  })
  if (authUpdateError) return errorResponse(authUpdateError.message, 400)

  const { data: profile, error: profileError } = await callerClient.rpc('admin_update_team_member', {
    p_user_id: userId,
    ...parsedMember.rpcArgs,
  })

  if (profileError || !profile) {
    // Best-effort rollback keeps Auth as the authority if the profile operation is rejected.
    await serviceClient.auth.admin.updateUserById(userId, {
      email: previousEmail || undefined,
      user_metadata: { ...currentAuth.user.user_metadata, full_name: previousFullName },
    })
    return errorResponse(profileError?.message || 'Unable to update the team member.', 400)
  }

  let finalProfile = profile
  if (parsedMember.employeeRoleId === null) {
    const { data: clearedProfile, error: clearRoleError } = await callerClient.rpc('set_user_employee_role', {
      target_user_id: userId,
      new_employee_role_id: null,
    })
    if (clearRoleError || !clearedProfile) {
      return errorResponse(clearRoleError?.message || 'Unable to clear the employee job role.', 400)
    }
    finalProfile = clearedProfile
  }

  // Keep the sign-in ban aligned with whatever status the full update produced.
  await syncAuthAccessBan(serviceClient, userId, finalProfile.status)

  return Response.json({ data: finalProfile as Profile }, { status: 200, headers: NO_STORE_HEADERS })
}
