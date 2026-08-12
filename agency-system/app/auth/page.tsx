'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Sparkles, Zap } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { updatePasswordAndMarkChanged } from '@/lib/supabase/auth'
import { InlineAlert, inputClassName, primaryButtonClassName } from '@/components/ui/page'

type AuthMode = 'signin' | 'reset' | 'update-password'

export default function AuthPage() {
  const router = useRouter()
  const { user, configured, loading: authLoading, signIn, resetPassword } = useAuth()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'update-password') {
      setMode('update-password')
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user && !user.is_anonymous && mode !== 'update-password') router.replace('/dashboard')
  }, [authLoading, mode, router, user])

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')
    setPassword('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')

    // The reset-link flow lands here with a fresh session; updating the password
    // also clears any pending temporary-password flag so the account unlocks.
    const result = mode === 'reset'
      ? await resetPassword(email)
      : mode === 'update-password'
        ? await updatePasswordAndMarkChanged(password)
        : await signIn(email, password)

    setSubmitting(false)
    if (result.error) {
      setError(result.error.message)
      return
    }

    if (mode === 'signin') router.replace('/dashboard')
    if (mode === 'reset') setMessage('If an account exists for that address, a password reset link has been sent.')
    if (mode === 'update-password') {
      setMessage('Your password has been updated. Redirecting…')
      setTimeout(() => router.replace('/dashboard'), 800)
    }
  }

  const title = mode === 'reset' ? 'Reset your password' : mode === 'update-password' ? 'Choose a new password' : 'Welcome back'
  const subtitle = mode === 'reset' ? 'We will email you a secure reset link.' : mode === 'update-password' ? 'Use at least eight characters.' : 'Login with your existing team account.'

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-16 sm:p-5">
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(hsl(0 0% 12%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 12%) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      <Link href="/" className="absolute left-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface/90 px-3 py-2 text-xs text-text-secondary backdrop-blur transition hover:border-line-light hover:text-fg sm:left-6 sm:top-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to public site
      </Link>
      <section className="relative z-10 w-full max-w-md rounded-md border border-border bg-surface p-6 shadow-2xl sm:p-9">
        <div className="mb-7">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
            <Zap className="h-5 w-5 text-accent" />
          </div>
          <p className="mb-2 font-mono-tech text-[10px] text-text-tertiary">AGENCY OS / SECURE ACCESS</p>
          <h1 className="text-2xl font-semibold text-fg">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
          {mode === 'signin' && (
            <p className="mt-4 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-xs leading-5 text-text-secondary">
              Existing staff accounts only. Public sign-up is not available.
            </p>
          )}
        </div>

        {!configured && (
          <div className="mb-5">
            <InlineAlert>Supabase is not configured. Add the variables from <code>.env.local.example</code> to <code>.env.local</code>.</InlineAlert>
          </div>
        )}
        {error && <div className="mb-5"><InlineAlert>{error}</InlineAlert></div>}
        {message && <div className="mb-5"><InlineAlert tone="success">{message}</InlineAlert></div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode !== 'update-password' && (
            <label className="block text-xs font-medium text-text-secondary">
              Email
              <span className="relative mt-2 block">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <input className={`${inputClassName} pl-9`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@agency.com" />
              </span>
            </label>
          )}

          {mode !== 'reset' && (
            <label className="block text-xs font-medium text-text-secondary">
              Password
              <span className="relative mt-2 block">
                <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <input className={`${inputClassName} px-9`} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required placeholder="At least 8 characters" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
          )}

          <button className={`${primaryButtonClassName} w-full`} type="submit" disabled={!configured || submitting}>
            {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {mode === 'reset' ? 'Send reset link' : mode === 'update-password' ? 'Update password' : 'Login'}
          </button>
        </form>

        <div className="mt-6 flex justify-center text-xs text-text-secondary">
          {mode === 'signin'
            ? <button onClick={() => changeMode('reset')} className="min-h-10 px-2 hover:text-accent">Forgot Password?</button>
            : <button onClick={() => changeMode('signin')} className="min-h-10 px-2 hover:text-accent">Return to Login</button>}
        </div>

        {mode === 'signin' && (
          <div className="mt-4 border-t border-border pt-5 text-center">
            <p className="text-xs text-text-tertiary">Here to request creative work? You do not need an account.</p>
            <Link href="/forms" className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
              <Sparkles className="h-4 w-4" /> Request a New Project
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
