'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { AlertCircle } from 'lucide-react'

export default function SignInPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
      } else {
        window.location.href = '/voter'
      }

    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#05060D]">
      <div className="absolute w-[500px] h-[500px] bg-[#F5C044]/10 blur-[140px] rounded-full top-[-150px] left-[-150px]" />
      <div className="absolute w-[500px] h-[500px] bg-[#F5C044]/10 blur-[140px] rounded-full bottom-[-150px] right-[-150px]" />

      <div className="relative w-full max-w-md bg-[#121421] border border-white/5 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.6)] p-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-gradient-to-br from-[#F5C044] to-[#D9A92E] rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(245,192,68,0.4)]">
            <span className="text-black font-bold text-lg tracking-widest">BV</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            Welcome Back
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Sign in to continue to BlakVote
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm text-white/50 mb-2">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
            />
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#F5C044] to-[#D9A92E] hover:opacity-90 transition shadow-[0_0_25px_rgba(245,192,68,0.3)] disabled:opacity-50"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-white/40">
          Don’t have an account?{' '}
          <Link
            href="/auth/sign-up"
            className="text-[#F5C044] hover:opacity-80 font-medium transition"
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  )
}