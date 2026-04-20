'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { supabase as authSupabase } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import { DSInput } from '@/components/ui/design-system'
import { Button } from '@/components/ui/button'
import BrandLogo from '@/components/BrandLogo'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

const RESET_COOLDOWN_KEY = 'blakvote_reset_cooldown_until'
const SUCCESS_COOLDOWN_MS = 45_000
const RATE_LIMIT_COOLDOWN_MS = 60_000

export default function SignInPage() {
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetCooldownUntil, setResetCooldownUntil] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = window.localStorage.getItem(RESET_COOLDOWN_KEY)
    const parsed = stored ? Number(stored) : 0
    return Number.isFinite(parsed) ? parsed : 0
  })
  const { toast } = useToast()
  const refreshPage = () => {
    window.location.reload()
  }

  const cooldownSecondsRemaining = Math.max(0, Math.ceil((resetCooldownUntil - Date.now()) / 1000))

  const setCooldown = (durationMs: number) => {
    const until = Date.now() + durationMs
    setResetCooldownUntil(until)
    window.localStorage.setItem(RESET_COOLDOWN_KEY, String(until))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!email || !password) {
        throw new Error('Email and password are required')
      }

      // 1️⃣ Sign in
      const { error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (authError) throw authError

      // 2️⃣ Ensure session is fully established
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser()

      if (sessionError || !user) {
        throw new Error('Session not established')
      }

      // 3️⃣ Fetch role from public.users
      const { data: userData, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (roleError) {
        throw new Error(roleError.message)
      }

      if (!userData) {
        throw new Error('User record does not exist in public.users')
      }

      if (!userData.role) {
        throw new Error('User role not assigned')
      }

      // 4️⃣ Hard redirect (middleware-safe)
      if (userData.role === 'admin') {
        window.location.href = '/admin'
      } else if (userData.role === 'organizer') {
        window.location.href = '/organizer'
      } else if (userData.role === 'voter') {
        window.location.href = '/events'
      } else {
        throw new Error('User role not supported')
      }

    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setError(null)

    if (cooldownSecondsRemaining > 0) {
      setError(`Please wait ${cooldownSecondsRemaining}s before requesting another reset link.`)
      return
    }

    if (!email) {
      setError('Enter your email address first to reset your password')
      return
    }

    setResetLoading(true)

    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`
      const { error: resetError } = await authSupabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (resetError) {
        throw resetError
      }

      setCooldown(SUCCESS_COOLDOWN_MS)

      toast({
        title: 'Reset email sent',
        description: 'Check your inbox for the password reset link.',
      })
    } catch (err: any) {
      const status = err?.status || err?.code
      const message = String(err?.message || '')

      if (status === 429 || message.toLowerCase().includes('too many requests')) {
        setCooldown(RATE_LIMIT_COOLDOWN_MS)
        setError('Too many reset attempts. Please wait 60 seconds, then try again.')
      } else {
        setError(err.message || 'Failed to send reset email')
      }
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="flex flex-col items-center mb-10">
          <button
            type="button"
            onClick={refreshPage}
            aria-label="Refresh page"
            className="flex items-center justify-center"
          >
            <BrandLogo size="lg" centered />
          </button>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to continue to BlakVote
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm text-foreground/70">
              Email
            </label>
            <DSInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-foreground/70">
              Password
            </label>
            <div className="relative">
              <DSInput
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-2xl pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={resetLoading || cooldownSecondsRemaining > 0}
              className="text-sm text-gold transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={handleForgotPassword}
            >
              {resetLoading
                ? 'Sending reset link...'
                : cooldownSecondsRemaining > 0
                  ? `Try again in ${cooldownSecondsRemaining}s`
                  : 'Forgot password?'}
            </button>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Don’t have an account?{' '}
          <Link
            href="/auth/sign-up"
            className="font-medium text-gold transition hover:opacity-80"
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  )
}