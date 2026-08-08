import { supabase } from './client'
import type { Profile } from './types'

// ============================================
// AUTH FUNCTIONS
// ============================================

export async function signUp(email: string, password: string, fullName: string) {
  if (!supabase) return { error: { message: 'Database not connected' } }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })

  if (error) return { data: null, error }

  // Create profile
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName,
    })
  }

  return { data, error: null }
}

export async function signIn(email: string, password: string) {
  if (!supabase) return { error: { message: 'Database not connected' } }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  return { data, error }
}

export async function signOut() {
  if (!supabase) return { error: { message: 'Database not connected' } }

  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getCurrentUser() {
  if (!supabase) return null

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) return null
  return data
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  if (!supabase) return { error: { message: 'Database not connected' } }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  return { data, error }
}

export async function resetPassword(email: string) {
  if (!supabase) return { error: { message: 'Database not connected' } }

  const { error } = await supabase.auth.resetPasswordForEmail(email)
  return { error }
}
