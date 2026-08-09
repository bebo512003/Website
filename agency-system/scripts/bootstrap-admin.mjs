import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.('.env.local')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
const fullName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Workspace Admin'

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Set BOOTSTRAP_ADMIN_EMAIL to a valid email address.')
  process.exit(1)
}
if (password.length < 8 || password.length > 128) {
  console.error('BOOTSTRAP_ADMIN_PASSWORD must contain 8–128 characters.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
  app_metadata: {
    agency_os_admin_provisioned: true,
    agency_os_bootstrap: true,
  },
})

if (error || !data.user) {
  console.error(`Bootstrap failed: ${error?.message || 'Auth user was not created.'}`)
  process.exit(1)
}

console.log(`Bootstrap Admin created: ${data.user.email}`)
console.log('Remove BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_NAME from the environment now.')
