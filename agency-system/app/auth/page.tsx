'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { updatePasswordAndMarkChanged } from '@/lib/supabase/auth'
import { PublicPage } from '@/components/public/public-page'
import { PublicNote, PublicPageIntro, PublicWorkArea, publicPanelClassName } from '@/components/public/public-page-sections'
import { SITE_CONTACT } from '@/lib/contact'
import { InlineAlert, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

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
  const subtitle = mode === 'reset' ? 'We will email you a secure reset link.' : mode === 'update-password' ? 'Use at least eight characters.' : 'Sign in with your existing team or client account.'

  return (
    <PublicPage>
      <PublicPageIntro
        eyebrow="Account access"
        title={title}
        description={subtitle}
        backLink={{ href: '/', label: 'Back to public site' }}
        compact
      />
      <PublicWorkArea aside={(
        <div className="space-y-8">
          <PublicNote
            eyebrow="Account support"
            title="Need help signing in?"
            action={<a href={SITE_CONTACT.mailto} className={secondaryButtonClassName}>Email for help <ArrowUpRight className="size-4" aria-hidden="true" /></a>}
          >
            Accounts are available by invitation for existing clients and team members.
          </PublicNote>
          {mode === 'signin' && (
            <PublicNote
              eyebrow="Project inquiries"
              title="Here to start a project?"
              action={<Link href="/forms" className={secondaryButtonClassName}>Request a project <ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
            >
              You can send a brief and track your request without signing in.
            </PublicNote>
          )}
        </div>
      )}>
        <section className={`${publicPanelClassName} p-5 sm:p-8`}>
          <p className="mb-6 type-label text-text-secondary">{mode === 'signin' ? 'Sign in' : mode === 'reset' ? 'Password reset' : 'Update password'}</p>
          {!configured && (
            <div className="mb-5">
              <InlineAlert>Account access is temporarily unavailable.</InlineAlert>
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
                  <input className={`${inputClassName} pl-9`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@company.com" />
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
              ? <button type="button" onClick={() => changeMode('reset')} className="min-h-10 px-2 hover:text-accent">Forgot Password?</button>
              : <button type="button" onClick={() => changeMode('signin')} className="min-h-10 px-2 hover:text-accent">Return to Login</button>}
          </div>
        </section>
      </PublicWorkArea>
    </PublicPage>
  )
}
