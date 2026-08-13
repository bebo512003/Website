import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Check if env vars are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create client (works even without env vars — returns a dummy client)
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export const isDatabaseConnected = !!(supabaseUrl && supabaseAnonKey)
