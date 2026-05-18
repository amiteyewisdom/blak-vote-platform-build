'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'

const RESET_STATE_KEY = 'blakvote_reset_state'

type ResetState = {
  email: string
  verified: boolean
  updatedAt: number
}

function readResetState(): ResetState | null {
  try {
    const raw = sessionStorage.getItem(RESET_STATE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'email' in parsed &&
      'verified' in parsed &&
      'updatedAt' in parsed &&
      typeof (parsed as { email: unknown }).email === 'string' &&
      typeof (parsed as { verified: unknown }).verified === 'boolean' &&
      typeof (parsed as { updatedAt: unknown }).updatedAt === 'number'
    ) {
      return parsed as ResetState
    }
    return null
  } catch {
    return null
  }
}

function VerifyResetContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const email = useMemo(() => (searchParams.get('email') ?? '').trim().toLowerCase(), [searchParams])

  const [otp,       setOtp]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const [resending, setResending] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [info,      setInfo]      = useState<string | null>(null)

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null); setInfo(null)

    const token = otp.trim()
    if (!email) { setError('Missing email. Return to forgot password.'); return }
    if (!/^\d{6}$/.test(token)) { setError('Enter the 6-digit code from your email.'); return }

    const resetState = readResetState()
    if (!resetState || resetState.email !== email) {
      setError('Reset session missing or changed. Start again from forgot password.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/password-reset/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: token }),
      })
      const data: { success?: boolean; error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification failed.')

      const verifiedState: ResetState = {
        email,
        verified: true,
        updatedAt: Date.now(),
      }
      sessionStorage.setItem(RESET_STATE_KEY, JSON.stringify(verifiedState))

      router.push('/auth/new-password?email=' + encodeURIComponent(email))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) return
    setResending(true); setError(null); setInfo(null)
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data: { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to resend.')
      const pendingState: ResetState = {
        email,
        verified: false,
        updatedAt: Date.now(),
      }
      sessionStorage.setItem(RESET_STATE_KEY, JSON.stringify(pendingState))
      setInfo('A fresh reset code has been sent to your inbox.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a reset code to{' '}
            <span className="font-medium text-foreground">{email || 'your email'}</span>
          </p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        ) : null}

        {info ? (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">{info}</div>
        ) : null}

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label htmlFor="otp" className="mb-2 block text-sm text-foreground/70">Reset code</label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              disabled={loading}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-14 w-full rounded-2xl border border-border bg-background/70 px-4 text-center text-2xl font-bold tracking-[0.5em] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              placeholder="——————"
              maxLength={6}
            />
          </div>

          <Button type="submit" disabled={loading || otp.length < 6} className="h-12 w-full">
            {loading
              ? <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />Verifying...</span>
              : <span className="inline-flex items-center gap-2"><ShieldCheck size={18} />Verify code</span>}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-2 text-sm">
          <button type="button" onClick={handleResend} disabled={resending}
            className="inline-flex items-center gap-1.5 font-medium text-gold transition hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed">
            <RotateCcw size={14} className={resending ? 'animate-spin' : ''} />
            {resending ? 'Sending...' : 'Resend code'}
          </button>
          <Link href="/auth/forgot-password" className="text-muted-foreground transition hover:text-foreground">Change email</Link>
        </div>
      </div>
    </div>
  )
}

export default function VerifyResetPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>}>
      <VerifyResetContent />
    </Suspense>
  )
}
