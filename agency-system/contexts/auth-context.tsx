'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, isDatabaseConnected } from '@/lib/supabase/client'
import {
  getProfile,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
  updateProfile,
  type AuthResult,
} from '@/lib/supabase/auth'
import type { Profile } from '@/lib/supabase/types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  isAdmin: boolean
  isManager: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  resetPassword: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  updateProfile: (updates: Partial<Profile>) => Promise<AuthResult>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (activeUser: User) => {
    setProfile(await getProfile(activeUser.id))
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const activeUser = data.session?.user ?? null
      setUser(activeUser)
      if (activeUser) await loadProfile(activeUser)
      if (mounted) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const activeUser = session?.user ?? null
      setUser(activeUser)
      if (!activeUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Defer the profile query until the auth callback has released the Supabase lock.
      setTimeout(() => {
        void loadProfile(activeUser).finally(() => setLoading(false))
      }, 0)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const handleSignOut = useCallback(async () => {
    const result = await signOut()
    if (!result.error) {
      setUser(null)
      setProfile(null)
    }
    return result
  }, [])

  const handleUpdateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('You must be signed in to update your profile.') }
    const { data, error } = await updateProfile(user.id, updates)
    if (!error && data) setProfile(data)
    return { error }
  }, [user])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user)
  }, [loadProfile, user])

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    loading,
    configured: isDatabaseConnected,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'admin' || profile?.role === 'manager',
    signIn,
    signUp,
    signOut: handleSignOut,
    resetPassword: requestPasswordReset,
    updatePassword,
    updateProfile: handleUpdateProfile,
    refreshProfile,
  }), [user, profile, loading, handleSignOut, handleUpdateProfile, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
