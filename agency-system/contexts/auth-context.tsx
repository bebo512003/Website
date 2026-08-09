'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, isDatabaseConnected } from '@/lib/supabase/client'
import {
  getProfile,
  requestPasswordReset,
  signIn,
  signInAnonymously,
  signOut,
  updatePassword,
  updateProfile,
  type AuthResult,
} from '@/lib/supabase/auth'
import type { Profile } from '@/lib/supabase/types'
import { getCurrentUserPermissions } from '@/lib/supabase/database'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  isAdmin: boolean
  isManager: boolean
  isClient: boolean
  isDeactivated: boolean
  isAnonymous: boolean
  permissions: string[]
  permissionsLoaded: boolean
  can: (permission: string) => boolean
  hasAny: (...permissions: string[]) => boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signInAnonymously: () => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  resetPassword: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  updateProfile: (updates: Partial<Profile>) => Promise<AuthResult>
  refreshProfile: () => Promise<void>
  refreshPermissions: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (activeUser: User) => {
    if (activeUser.is_anonymous) {
      setProfile(null)
      setPermissions([])
      setPermissionsLoaded(true)
      return
    }
    setProfile(await getProfile(activeUser.id))
    const result = await getCurrentUserPermissions()
    if (result.error) {
      setPermissions([])
    } else {
      setPermissions(result.data)
    }
    setPermissionsLoaded(true)
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
      if (activeUser && !activeUser.is_anonymous) {
        await loadProfile(activeUser)
      } else {
        setPermissions([])
        setPermissionsLoaded(true)
      }
      if (mounted) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const activeUser = session?.user ?? null
      setUser(activeUser)
      if (!activeUser || activeUser.is_anonymous) {
        setProfile(null)
        setPermissions([])
        setPermissionsLoaded(true)
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
    const { data, error } = await updateProfile(user.id, { ...profile, ...updates })
    if (!error && data) setProfile(data)
    return { error }
  }, [profile, user])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user)
  }, [loadProfile, user])

  const refreshPermissions = useCallback(async () => {
    if (!user || user.is_anonymous) return
    const result = await getCurrentUserPermissions()
    if (!result.error) setPermissions(result.data)
    setPermissionsLoaded(true)
  }, [user])

  const isAnonymous = !!(user && user.is_anonymous)

  const can = useCallback((permission: string) => permissions.includes(permission), [permissions])
  const hasAny = useCallback((...required: string[]) => required.some((permission) => permissions.includes(permission)), [permissions])

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    loading,
    configured: isDatabaseConnected,
    isAdmin: permissions.includes('admin.manage'),
    isManager: permissions.includes('admin.manage') || permissions.includes('project.view_all'),
    isClient: profile?.role === 'client',
    isDeactivated: !!profile && profile.status === 'inactive',
    isAnonymous,
    permissions,
    permissionsLoaded,
    can,
    hasAny,
    signIn,
    signInAnonymously,
    signOut: handleSignOut,
    resetPassword: requestPasswordReset,
    updatePassword,
    updateProfile: handleUpdateProfile,
    refreshProfile,
    refreshPermissions,
  }), [user, profile, loading, permissions, permissionsLoaded, isAnonymous, can, hasAny, handleSignOut, handleUpdateProfile, refreshProfile, refreshPermissions])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
