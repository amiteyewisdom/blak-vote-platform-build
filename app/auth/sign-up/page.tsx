'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle } from 'lucide-react'

export default function SignUpPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  // Only allow voter role
  const role = 'voter'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!email || !password) {
      toast({ title: 'Validation', description: 'Email and password required', variant: 'destructive' })
      return
    }

    if (password !== confirmPassword) {
      toast({ title: 'Validation', description: 'Passwords do not match', variant: 'destructive' })
      return
    }

    if (password.length < 8) {
      toast({ title: 'Validation', description: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }

    setLoading(true)

    // Only allow voter role
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'voter',
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
        }
      }
    })

    if (error) {
      toast({ title: 'Signup error', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('users').insert({
          id: data.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          role: 'user',
      status: 'active',
})
    }

    setLoading(false)

    toast({
      title: 'Account created',
      description: 'Please sign in to continue',
    })

    router.push('/auth/sign-in')
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#05060D]">

      {/* Ambient glow */}
      <div className="absolute w-[600px] h-[600px] bg-[#F5C044]/10 blur-[160px] rounded-full top-[-200px] left-[-200px]" />
      <div className="absolute w-[600px] h-[600px] bg-[#F5C044]/10 blur-[160px] rounded-full bottom-[-200px] right-[-200px]" />

      <div className="relative w-full max-w-xl bg-[#121421] border border-white/5 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.6)] p-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#F5C044] to-[#D9A92E] rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(245,192,68,0.4)]">
            <span className="text-black font-bold text-lg tracking-widest">BV</span>
          </div>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            Create Your Account
          </h1>

          <p className="text-white/40 text-sm mt-2">
            Start building and managing premium voting events
          </p>
        </div>

        <div className="space-y-6">

          {/* Names */}
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="First Name"
              onChange={(e) => setFirstName(e.target.value)}
              className="bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
            />
            <input
              type="text"
              placeholder="Last Name"
              onChange={(e) => setLastName(e.target.value)}
              className="bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
            />
          </div>

          {/* Email */}
          <input
            type="email"
            placeholder="Email Address"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
          />

          {/* Phone */}
          <input
            type="tel"
            placeholder="Phone Number"
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
          />

          {/* Role */}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white transition"
          >
            <option value="user">User</option>
            <option value="organizer">Organizer</option>
          </select>

          {/* Password */}
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
          />

          {/* Confirm */}
          <input
            type="password"
            placeholder="Confirm Password"
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-[#181822] border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-[#F5C044] text-white placeholder:text-white/30 transition"
          />

          {/* Submit */}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#F5C044] to-[#D9A92E] hover:opacity-90 transition shadow-[0_0_25px_rgba(245,192,68,0.3)] disabled:opacity-50"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

        </div>

        <div className="mt-8 text-center text-sm text-white/40">
          Already have an account?{' '}
          <Link
            href="/auth/sign-in"
            className="text-[#F5C044] hover:opacity-80 font-medium transition"
          >
            Sign In
          </Link>
        </div>

      </div>
    </div>
  )
}
