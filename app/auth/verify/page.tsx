'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/auth'
import { getAuthenticatedUserRole, getRedirectPathForRole } from '@/lib/auth/role-routing'

const AUTH_CALLBACK_URL =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? 'https://app.blakvote.com/auth/callback'

type SignupState = {
  fullName: string
  email: string
  password: string
}

function parseSignupState(): SignupState | null {
  try {
    const raw = sessionStorage.getItem('blakvote_signup_state')
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'fullName' in parsed &&
      'email' in parsed &&
      'password' in parsed
    ) {
      return parsed as SignupState
    }
    return null
  } catch {
    return null
  }
}

function VerifyOtpContent() {
  const searchParams = useSearchParams()
  const email = useMemo(() => (searchParams.get('email') ?? '').trim().toLowerCase(), [searchParams])
  const intent = useMemo(() => searchParams.get('intent'), [searchParams])
  const isSignup = intent === 'signup'

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const token = otp.trim()
    if (!email) {
      setError('Missing email address. Restart the flow to continue.')
      return
    }

    if (token.length < 6) {
      setError('Enter the full 6-digit verification code from your email.')
      return
    }

    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      })

      if (verifyError) throw verifyError

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) throw new Error('Session could not be established after verification.')

      if (isSignup) {
        const signupData = parseSignupState()

        if (signupData?.password) {
          const { error: pwError } = await supabase.auth.updateUser({
            password: signupData.password,
          })
          if (pwError) throw pwError
        }

        if (signupData) {
          const nameParts = signupData.fullName.trim().split(/\s+/)
          const firstName = nameParts[0] ?? ''
          const lastName = nameParts.slice(1).join(' ')

          await supabase.from('users').insert({
            id: user.id,
            email: user.email ?? signupData.email,
            first_name: firstName,
            last_name: lastName,
            role: 'voter',
            status: 'active',
          })
        }

        sessionStorage.removeItem('blakvote_signup_state')
        window.location.replace('/vote')
      } else {
        const role = await getAuthenticatedUserRole(supabase, user)
        const nextPath = getRedirectPathForRole(role)
        window.location.replace(nextPath)
      }
    } catch (verifyException) {
      const message =
        verifyException instanceof Error ? verifyException.message : 'Failed to verify the OTP code.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      setError('Missing email address. Restart the flow to continue.')
      return
    }

    setResending(true)
    setError(null)
    setInfo(null)

    try {
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: isSignup,
          emailRedirectTo: AUTH_CALLBACK_URL,
        },
      })

      if (resendError) throw resendError

      setInfo('A fresh verification code has been sent to your inbox.')
    } catch (resendException) {
      const message =
        resendException instanceof Error ? resendException.message : 'Unable to resend verification code.'
      setError(message)
    } finally {
      setResending(false)
    }
  }

  const backHref = isSignup ? '/auth/signup' : '/auth/login'
  const backLabel = isSignup ? 'Change details' : 'Change email'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            {isSignup ? 'Verify your email' : 'Verify OTP'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the code sent to{' '}
            <span className="font-medium text-foreground">{email || 'your email'}</span>
          </p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {info ? (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {info}
          </div>
        ) : null}

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label htmlFor="otp" className="mb-2 block text-sm text-foreground/70">
              One-time code
            </label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\s+/g, ''))}
              className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 text-center text-lg tracking-[0.35em] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="123456"
              maxLength={8}
            />
          </div>

          <Button type="submit" disabled={loading || !email} className="h-12 w-full">
            {loading ? (
              'Verifying...'
            ) : (
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={18} />
                {isSignup ? 'Verify and create account' : 'Verify and continue'}
              </span>
            )}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || !email}
            className="font-medium text-gold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? 'Resending...' : 'Resend code'}
          </button>
          <Link href={backHref} className="text-muted-foreground transition hover:text-foreground">
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center bg-background">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  )
}
