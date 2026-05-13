'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/auth'
import { getAuthenticatedUserRole, getRedirectPathForRole } from '@/lib/auth/role-routing'

type SignupState = { fullName: string; email: string; password: string }

function readSignupState(): SignupState | null {
  try {
    const raw = sessionStorage.getItem('blakvote_signup_state')
    if (!raw) return null
    const p: unknown = JSON.parse(raw)
    if (
      p !== null && typeof p === 'object' &&
      'fullName' in p && 'email' in p && 'password' in p &&
      typeof (p as { fullName: unknown }).fullName === 'string' &&
      typeof (p as { email: unknown }).email   === 'string' &&
      typeof (p as { password: unknown }).password === 'string'
    ) return p as SignupState
    return null
  } catch { return null }
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const email = useMemo(() => (searchParams.get('email') ?? '').trim().toLowerCase(), [searchParams])

  const [otp,          setOtp]          = useState('')
  const [loading,      setLoading]      = useState(false)
  const [resending,    setResending]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [info,         setInfo]         = useState<string | null>(null)
  const [noState,      setNoState]      = useState(false)
  const [accountDone,  setAccountDone]  = useState(false)

  useEffect(() => {
    if (readSignupState() === null) setNoState(true)
  }, [])

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setInfo(null)

    const token = otp.trim()
    if (!email) { setError('Missing email. Return to signup.'); return }
    if (!/^\d{6}$/.test(token)) { setError('Enter the 6-digit code from your email.'); return }

    const state = readSignupState()
    if (!state) { setNoState(true); return }

    setLoading(true)
    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: token, type: 'signup', password: state.password, fullName: state.fullName }),
      })
      const data: { success?: boolean; error?: string } = await res.json()

      if (!res.ok) {
        if (res.status === 409) { setError(data.error ?? 'Account already exists. Please sign in.'); return }
        throw new Error(data.error ?? 'Verification failed.')
      }

      sessionStorage.removeItem('blakvote_signup_state')

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: state.password })
      if (signInError) { setAccountDone(true); return }

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) { setAccountDone(true); return }

      const role = await getAuthenticatedUserRole(supabase, user)
      window.location.replace(getRedirectPathForRole(role))
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
      const state = readSignupState()
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'signup', fullName: state?.fullName }),
      })
      const data: { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to resend.')
      setInfo('A fresh code has been sent to your inbox.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend code.')
    } finally {
      setResending(false)
    }
  }

  if (noState) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
        <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
        <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-8 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] text-center">
          <AlertCircle size={40} className="mx-auto mb-4 text-destructive" />
          <h1 className="text-xl font-semibold text-foreground mb-2">Session expired</h1>
          <p className="text-sm text-muted-foreground mb-6">Your signup session has expired or was cleared. Please start again.</p>
          <Button asChild className="w-full h-12"><Link href="/auth/signup">Back to signup</Link></Button>
        </div>
      </div>
    )
  }

  if (accountDone) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
        <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
        <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-8 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
          <h1 className="text-2xl font-semibold text-foreground mb-2">Account created!</h1>
          <p className="text-sm text-muted-foreground mb-6">Your account is ready. Sign in to continue.</p>
          <Button asChild className="w-full h-12"><Link href="/auth/login">Go to sign in</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a 6-digit code to{' '}
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
            <label htmlFor="otp" className="mb-2 block text-sm text-foreground/70">Verification code</label>
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
              : <span className="inline-flex items-center gap-2"><ShieldCheck size={18} />Verify and create account</span>}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-2 text-sm">
          <button type="button" onClick={handleResend} disabled={resending}
            className="inline-flex items-center gap-1.5 font-medium text-gold transition hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed">
            <RotateCcw size={14} className={resending ? 'animate-spin' : ''} />
            {resending ? 'Sending...' : 'Resend code'}
          </button>
          <Link href="/auth/signup" className="text-muted-foreground transition hover:text-foreground">Change details</Link>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}
