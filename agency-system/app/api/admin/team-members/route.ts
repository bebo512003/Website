import { createClient } from '@supabase/supabase-js'
import type { Database, Json, Profile, ProfileStatus } from '@/lib/supabase/types'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TeamMemberRequest = {
  password?: unknown
  member?: Record<string, unknown>
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS })
}

function optionalText(value: unknown, maxLength = 500) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
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
 * Creates a real Supabase Auth user and its internal profile.
 *
 * The service-role key is used only after the caller's JWT has been verified and
 * the database confirms the caller has `admin.manage`. It must never be moved to
 * a NEXT_PUBLIC environment variable or returned to the browser.
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return errorResponse('Team account provisioning is not configured on the server.', 503)
  }

  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
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
  const password = typeof body.password === 'string' ? body.password : ''
  if (!member || typeof member !== 'object' || Array.isArray(member)) return errorResponse('Team member details are required.', 400)

  const email = typeof member.email === 'string' ? member.email.trim().toLowerCase() : ''
  const fullName = typeof member.full_name === 'string' ? member.full_name.trim() : ''
  if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) return errorResponse('A valid email address is required.', 400)
  if (!fullName || fullName.length > 200) return errorResponse('Full name is required.', 400)
  if (password.length < 8) return errorResponse('The initial password must contain at least 8 characters.', 400)
  if (password.length > 128) return errorResponse('The initial password must not exceed 128 characters.', 400)

  const roleId = optionalUuid(member.role_id)
  const employeeRoleId = optionalUuid(member.employee_role_id)
  if (roleId === undefined || employeeRoleId === undefined) return errorResponse('Invalid role identifier.', 400)

  const status: ProfileStatus = member.status === 'inactive' ? 'inactive' : 'active'
  const callerClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
  if (callerError || !callerData.user) return errorResponse('Your session is invalid or has expired.', 401)

  const { data: permissions, error: permissionsError } = await callerClient.rpc('get_user_permissions')
  if (permissionsError) return errorResponse('Unable to verify administrator permissions.', 403)
  if (!permissions.includes('admin.manage')) return errorResponse('Administrator access required.', 403)

  const rpcArgs = {
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
    p_status: status,
  }

  // Create the permission-checked placeholder first. The auth.users trigger will
  // atomically claim it by e-mail when the trusted server creates the Auth user.
  const { data: placeholder, error: placeholderError } = await callerClient.rpc('admin_create_team_member', rpcArgs)
  if (placeholderError || !placeholder) {
    return errorResponse(placeholderError?.message || 'Unable to create the team member profile.', 400)
  }

  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const cleanupPlaceholder = async () => {
    await serviceClient.from('profiles').delete().eq('id', placeholder.id)
  }

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: {
      agency_os_admin_provisioned: true,
      agency_os_provisioned_by: callerData.user.id,
    },
  })

  if (createError || !created.user) {
    await cleanupPlaceholder()
    return errorResponse(createError?.message || 'Unable to create the login account.', 400)
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

  return Response.json({ data: profile as Profile }, { status: 201, headers: NO_STORE_HEADERS })
}
