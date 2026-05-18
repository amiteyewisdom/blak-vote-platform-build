'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'

export default function SignupPage() {
  const [step, setStep] = useState<'details' | 'verify' | 'done'>('details')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const normalizedEmail = email.trim().toLowerCase()

  const handleRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!fullName.trim()) {
      setError('Enter your full name.')
      return
    }

    if (!normalizedEmail) {
      setError('Enter your email address.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), email: normalizedEmail, password }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to send verification code.')
      }

      setStep('verify')
      setMessage(payload?.message || 'We sent a verification code to your email.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to send verification code.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit verification code.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, otp: otp.trim() }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to verify code.')
      }

      setStep('done')
      setMessage(payload?.message || 'Your account has been created successfully.')

      window.setTimeout(() => {
        window.location.replace(payload?.redirectTo || '/voter')
      }, 1200)
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Failed to verify code.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setMessage(null)
    setResending(true)

    try {
      const res = await fetch('/api/auth/signup/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), email: normalizedEmail, password }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to resend verification code.')
      }

      setMessage(payload?.message || 'A new verification code has been sent.')
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Failed to resend verification code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Create your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign up with your email, then enter the OTP we send to complete account verification.
          </p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {message ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}

        {step === 'details' ? (
          <form onSubmit={handleRequest} className="space-y-5">
            <div>
              <label htmlFor="fullName" className="mb-2 block text-sm text-foreground/70">Full name</label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Jane Doe"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm text-foreground/70">Email</label>
              <div className="relative">
                <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-background/70 pl-11 pr-4 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm text-foreground/70">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="At least 8 characters"
              />
            </div>

            <Button type="submit" disabled={loading} className="h-12 w-full">
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />Sending code...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><ArrowRight size={18} />Continue</span>
              )}
            </Button>
          </form>
        ) : null}

        {step === 'verify' ? (
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{normalizedEmail}</span>.
            </div>

            <div>
              <label htmlFor="otp" className="mb-2 block text-sm text-foreground/70">Verification code</label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-14 w-full rounded-2xl border border-border bg-background/70 px-4 text-center text-2xl font-bold tracking-[0.45em] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="123456"
              />
            </div>

            <Button type="submit" disabled={loading || otp.length !== 6} className="h-12 w-full">
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />Verifying...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><ShieldCheck size={18} />Verify and create account</span>
              )}
            </Button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full text-sm font-medium text-gold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? 'Sending a new code...' : 'Resend code'}
            </button>
          </form>
        ) : null}

        {step === 'done' ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Account created</h2>
              <p className="mt-2 text-sm text-muted-foreground">You are being redirected to your dashboard.</p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-gold transition hover:opacity-80">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
