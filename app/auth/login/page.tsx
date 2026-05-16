'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabaseClient'
import { getAuthenticatedUserRole, getRedirectPathForRole } from '@/lib/auth/role-routing'
import { SUPPORT_EMAIL_HREF } from '@/lib/support-contact'

function getLoginErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to sign in.'
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('invalid login credentials') ||
    normalizedMessage.includes('invalid credentials')
  ) {
    return 'Email or password is incorrect. If you recently changed your password, try again or reset it.'
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Your account is not ready for password sign-in yet. Reset your password or contact support for help.'
  }

  return message
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (authError) throw authError
      if (!user) throw new Error('Sign-in succeeded but no user account was returned.')

      const role = await getAuthenticatedUserRole(supabase, user)
      const nextPath = getRedirectPathForRole(role)
      window.location.replace(nextPath)
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to continue to BlakVote</p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-foreground/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm text-foreground/70">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 pr-12 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="text-sm text-gold transition hover:opacity-80">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? (
              'Signing in...'
            ) : (
              <span className="inline-flex items-center gap-2">
                <LogIn size={18} />
                Sign in
              </span>
            )}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Need an account?{' '}
          <a href={SUPPORT_EMAIL_HREF} className="font-medium text-gold transition hover:opacity-80">
            Contact us for setup
          </a>
        </div>
      </div>
    </div>
  )
}
