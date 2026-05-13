'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'

function NewPasswordContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const email = useMemo(() => (searchParams.get('email') ?? '').trim().toLowerCase(), [searchParams])

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [done,            setDone]            = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!email) { setError('Missing email. Please restart the reset flow.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword: password }),
      })
      const data: { success?: boolean; error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update password.')
      setDone(true)
      setTimeout(() => router.replace('/auth/login'), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update password.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
        <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
        <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-8 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
          <h1 className="text-2xl font-semibold text-foreground mb-2">Password updated!</h1>
          <p className="text-sm text-muted-foreground mb-6">Your password has been changed. Redirecting you to sign in…</p>
          <Link href="/auth/login" className="text-sm font-medium text-gold hover:opacity-80 transition">Go to sign in now</Link>
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
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Set new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a strong password for your account.</p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm text-foreground/70">New password</label>
            <div className="relative">
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 pr-12 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="mb-2 block text-sm text-foreground/70">Confirm password</label>
            <div className="relative">
              <input id="confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 px-4 pr-12 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Repeat your password" />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading
              ? <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />Updating password...</span>
              : <span className="inline-flex items-center gap-2"><KeyRound size={18} />Set new password</span>}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <Link href="/auth/login" className="text-muted-foreground transition hover:text-foreground">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default function NewPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>}>
      <NewPasswordContent />
    </Suspense>
  )
}
