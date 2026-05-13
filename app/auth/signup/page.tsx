'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Eye, EyeOff, UserPlus } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/auth'

const AUTH_CALLBACK_URL =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? 'https://app.blakvote.com/auth/callback'

const SIGNUP_STATE_KEY = 'blakvote_signup_state'

type SignupState = {
  fullName: string
  email: string
  password: string
}

function storeSignupState(state: SignupState): void {
  sessionStorage.setItem(SIGNUP_STATE_KEY, JSON.stringify(state))
}

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmedName = fullName.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (!trimmedName) {
      setError('Full name is required.')
      return
    }

    if (!normalizedEmail) {
      setError('Email address is required.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      storeSignupState({ fullName: trimmedName, email: normalizedEmail, password })

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: AUTH_CALLBACK_URL,
          data: { full_name: trimmedName, role: 'voter' },
        },
      })

      if (otpError) {
        sessionStorage.removeItem(SIGNUP_STATE_KEY)
        throw otpError
      }

      router.push('/auth/verify?email=' + encodeURIComponent(normalizedEmail) + '&intent=signup')
    } catch (signupError) {
      const message = signupError instanceof Error ? signupError.message : 'Failed to send verification code.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Create account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Join BlakVote — a code will be sent to verify your email
          </p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="mb-2 block text-sm text-foreground/70">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value.slice(0, 120))}
              className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="First Last"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-foreground/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value.slice(0, 255))}
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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 pr-12 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="At least 8 characters"
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

          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm text-foreground/70">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 pr-12 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Repeat your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="mt-2 h-12 w-full">
            {loading ? (
              'Sending verification code...'
            ) : (
              <span className="inline-flex items-center gap-2">
                <UserPlus size={18} />
                Create account
                <ArrowRight size={16} />
              </span>
            )}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-gold transition hover:opacity-80">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
