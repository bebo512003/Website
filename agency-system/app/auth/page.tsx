'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, signUp } = useAuth()
  
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName)
        if (error) {
          setError(error.message)
        } else {
          setSuccess('تم إنشاء الحساب بنجاح! تم إرسال رابط التأكيد للإيميل.')
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message)
        } else {
          router.push('/')
        }
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(hsl(0 0% 12%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 12%) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.3,
        }}
      />
      <div
        className="fixed top-0 right-0 w-[600px] h-[600px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top right, hsl(358 75% 50%), transparent 70%)',
          opacity: 0.06,
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-text-secondary hover:text-fg transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">العودة للرئيسية</span>
        </button>

        {/* Card */}
        <div className="relative bg-surface border border-border overflow-hidden rounded-lg">
          <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-accent/40 via-accent/10 to-transparent" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t border-l border-line-light" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-r border-line-light" />

          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 mb-4">
                <Zap className="h-6 w-6 text-accent" />
              </div>
              <h1 className="font-display text-3xl text-fg mb-2">
                {isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول'}
              </h1>
              <p className="text-sm text-text-secondary">
                {isSignUp ? 'انضم إلى Agency OS' : 'مرحباً بعودتك'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-mono-tech text-text-secondary mb-2">
                    الاسم الكامل
                  </label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={isSignUp}
                      placeholder="أحمد محمد"
                      className="w-full border border-border bg-surface-raised rounded px-3 py-2.5 pr-9 text-sm text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono-tech text-text-secondary mb-2">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="ahmed@example.com"
                    className="w-full border border-border bg-surface-raised rounded px-3 py-2.5 pr-9 text-sm text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono-tech text-text-secondary mb-2">
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full border border-border bg-surface-raised rounded px-3 py-2.5 pr-9 pl-9 text-sm text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-fg"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="border border-red-500/30 bg-red-500/5 rounded px-3 py-2 text-xs text-red-500">
                  {error}
                </div>
              )}

              {success && (
                <div className="border border-green-500/30 bg-green-500/5 rounded px-3 py-2 text-xs text-green-500">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full border border-accent bg-accent text-accent-foreground rounded px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'جاري...' : isSignUp ? 'إنشاء الحساب' : 'تسجيل الدخول'}
              </button>
            </form>

            {/* Toggle */}
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError('')
                  setSuccess('')
                }}
                className="text-xs text-text-secondary hover:text-accent transition-colors"
              >
                {isSignUp ? 'عندك حساب؟ سجل دخول' : 'مش عندك حساب؟ اعمل واحد'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="font-mono-tech text-[10px] text-text-tertiary">
            AGENCY OS • SECURE AUTHENTICATION
          </p>
        </div>
      </div>
    </div>
  )
}
