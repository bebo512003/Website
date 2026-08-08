import { supabase } from './client'
import type { Profile } from './types'

export type AuthResult = { error: Error | null }

function unavailableError() {
  return new Error('Supabase is not configured. Add the required environment variables before signing in.')
}

export async function signUp(email: string, password: string, fullName: string): Promise<AuthResult> {
  if (!supabase) return { error: unavailableError() }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      emailRedirectTo: `${siteUrl}/auth`,
    },
  })

  return { error: error ? new Error(error.message) : null }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { error: unavailableError() }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  return { error: error ? new Error(error.message) : null }
}

export async function signOut(): Promise<AuthResult> {
  if (!supabase) return { error: unavailableError() }
  const { error } = await supabase.auth.signOut()
  return { error: error ? new Error(error.message) : null }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) {
    console.error('Unable to load the signed-in profile:', error.message)
    return null
  }
  return data
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  if (!supabase) return { data: null, error: unavailableError() }

  const allowedUpdates = {
    full_name: updates.full_name,
    avatar_url: updates.avatar_url,
    agency_name: updates.agency_name,
    agency_website: updates.agency_website,
    phone: updates.phone,
    bio: updates.bio,
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(allowedUpdates)
    .eq('id', userId)
    .select()
    .single()

  return { data, error: error ? new Error(error.message) : null }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { error: unavailableError() }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${siteUrl}/auth?mode=update-password`,
  })
  return { error: error ? new Error(error.message) : null }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return { error: unavailableError() }
  const { error } = await supabase.auth.updateUser({ password })
  return { error: error ? new Error(error.message) : null }
}
