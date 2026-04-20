'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import BrandLogo from '@/components/BrandLogo'

export default function ResetPasswordPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [validRecoverySession, setValidRecoverySession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshPage = () => {
    window.location.reload()
  }

  useEffect(() => {
    let active = true

    const checkRecoveryState = async () => {
      const { data } = await supabase.auth.getSession()
      if (active && data.session) {
        setValidRecoverySession(true)
      }
    }

    checkRecoveryState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return
      }

      if (event === 'PASSWORD_RECOVERY' || session) {
        setValidRecoverySession(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validRecoverySession) {
      setError('Open this page from the password reset link in your email.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        throw updateError
      }

      toast({
        title: 'Password updated',
        description: 'You can now sign in with your new password.',
      })

      router.replace('/auth/sign-in')
    } catch (err: any) {
      setError(err.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background px-6">
      <div className="absolute w-[500px] h-[500px] bg-[hsl(var(--gold))]/10 blur-[140px] rounded-full top-[-150px] left-[-150px]" />
      <div className="absolute w-[500px] h-[500px] bg-[hsl(var(--gold))]/10 blur-[140px] rounded-full bottom-[-150px] right-[-150px]" />

      <div className="relative w-full max-w-md bg-surface-card border border-border/60 rounded-3xl shadow-[0_0_60px_hsl(var(--foreground)/0.6)] p-10">
        <div className="flex flex-col items-center mb-10 text-center">
          <button
            type="button"
            onClick={refreshPage}
            aria-label="Refresh page"
            className="flex items-center justify-center"
          >
            <BrandLogo size="lg" centered />
          </button>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            Reset Password
          </h1>
          <p className="text-foreground/40 text-sm mt-2">
            Enter a new password for your BlakVote account.
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {!validRecoverySession && !error && (
          <div className="mb-6 bg-white/5 border border-border rounded-xl p-4 text-sm text-foreground/70">
            Open the reset link from your email to continue.
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div>
            <label className="block text-sm text-foreground/50 mb-2">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-card border border-border p-4 pr-12 rounded-2xl outline-none focus:ring-2 focus:ring-[hsl(var(--gold))] text-foreground placeholder:text-foreground/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60 transition"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-foreground/50 mb-2">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-surface-card border border-border p-4 pr-12 rounded-2xl outline-none focus:ring-2 focus:ring-[hsl(var(--gold))] text-foreground placeholder:text-foreground/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60 transition"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !validRecoverySession}
            className="w-full py-4 rounded-xl font-semibold text-gold-foreground bg-gradient-to-r from-gold to-gold-deep hover:brightness-110 hover:shadow-[0_4px_24px_hsl(var(--gold)/0.35)] active:scale-[0.97] transition-all duration-200 shadow-[0_0_20px_hsl(var(--gold)/0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-foreground/40">
          Remembered your password?{' '}
          <Link
            href="/auth/sign-in"
            className="text-gold hover:opacity-80 font-medium transition"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

