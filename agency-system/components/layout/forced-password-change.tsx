'use client'

import { useState } from 'react'
import { Eye, EyeOff, KeyRound, LoaderCircle, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { updatePasswordAndMarkChanged, verifyCurrentPassword } from '@/lib/supabase/auth'
import { InlineAlert, inputClassName, primaryButtonClassName } from '@/components/ui/page'

/**
 * Full-screen gate rendered instead of the workspace for every account whose
 * temporary password has not been replaced yet. There is no navigation out of
 * this screen except signing out — the database enforces the same block by
 * returning no permissions while the flag is pending.
 */
export function ForcedPasswordChangeScreen({ style }: { style: Record<string, string> }) {
  const { user, signOut, refreshProfile, refreshPermissions } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user?.email) return
    setError('')

    if (!currentPassword) {
      setError('Enter the temporary password you received from your administrator.')
      return
    }
    if (newPassword.length < 8) {
      setError('The new password must contain at least 8 characters.')
      return
    }
    if (newPassword === currentPassword) {
      setError('The new password must be different from the temporary password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    setSaving(true)
    const verification = await verifyCurrentPassword(user.email, currentPassword)
    if (verification.error) {
      setError(verification.error.message)
      setSaving(false)
      return
    }

    const result = await updatePasswordAndMarkChanged(newPassword)
    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    // Clearing the flag lifts both this gate and the database-level block.
    await refreshProfile()
    await refreshPermissions()
    setSaving(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5" style={style}>
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-8 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
            <KeyRound className="h-6 w-6 text-accent" />
          </div>
          <button onClick={() => void signOut()} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-tertiary hover:text-fg">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>

        <h1 className="text-xl font-semibold text-fg">Set your own password</h1>
        <p className="mt-3 text-sm text-text-secondary">
          You signed in with a temporary password created by your administrator. Choose your own
          password to unlock the workspace. This is required before you can continue.
        </p>

        {error && <div className="mt-5"><InlineAlert>{error}</InlineAlert></div>}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-text-secondary">
            Temporary password
            <span className="relative mt-2 block">
              <input
                className={`${inputClassName} pr-9`}
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                placeholder="The password you were given"
              />
              <button type="button" onClick={() => setShowCurrent((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg" aria-label={showCurrent ? 'Hide password' : 'Show password'}>
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <label className="block text-xs font-medium text-text-secondary">
            New password
            <input
              className={`${inputClassName} mt-2`}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="At least 8 characters"
            />
          </label>

          <label className="block text-xs font-medium text-text-secondary">
            Confirm new password
            <input
              className={`${inputClassName} mt-2`}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="Repeat the new password"
            />
          </label>

          <button className={`${primaryButtonClassName} w-full`} type="submit" disabled={saving}>
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Save new password &amp; continue
          </button>
        </form>

        <p className="mt-4 text-[11px] text-text-tertiary">
          Forgot the temporary password? Ask your administrator to deactivate this account and
          create a fresh one, or use the password-reset e-mail if it is enabled.
        </p>
      </section>
    </main>
  )
}
