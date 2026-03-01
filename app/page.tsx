'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle, Lock, BarChart3, Users } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError || !session?.user) {
          setLoading(false)
          return
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (userError || !userData) {
          setLoading(false)
          return
        }

        if (userData?.role === 'admin') {
          router.push('/admin')
        } else if (userData?.role === 'organizer') {
          router.push('/organizer')
        } else {
          router.push('/voter')
        }
      } catch (error) {
        console.error('[v0] Auth check error:', error)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0B0F] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#121218]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#F5C044] to-[#E6B030] rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-[#0B0B0F] font-bold text-lg">BV</span>
            </div>
            <span className="font-bold text-xl tracking-wide text-white">BlakVote</span>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => router.push('/auth/sign-in')}>Sign In</button>
            <button className="btn-primary" onClick={() => router.push('/auth/sign-up')}>Get Started</button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col justify-center items-center relative overflow-hidden py-24">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[700px] h-[700px] bg-gradient-radial from-[#F5C044]/30 via-[#0B0B0F]/80 to-transparent rounded-full blur-3xl opacity-80 animate-pulse-slow" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 bg-gradient-to-r from-[#F5C044] via-white to-[#E6B030] bg-clip-text text-transparent drop-shadow-lg">
            The Future of Digital Voting
          </h1>
          <p className="text-2xl text-muted mb-10 font-medium">
            BlakVote is the luxury platform for secure, transparent, and elegant digital voting. Trusted by organizations, awards, and events.
          </p>
          <div className="flex flex-col sm:flex-row gap-5 justify-center">
            <button className="btn-primary flex items-center gap-2 text-lg px-8 py-4" onClick={() => router.push('/auth/sign-up')}>
              Start Voting <ArrowRight className="w-5 h-5" />
            </button>
            <button className="btn-secondary flex items-center gap-2 text-lg px-8 py-4" onClick={() => document.getElementById('features')?.scrollIntoView({behavior:'smooth'})}>
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 border-t border-white/5 bg-[#121218]/80">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-white text-center mb-14 tracking-tight">Why Choose BlakVote?</h2>
          <div className="grid md:grid-cols-2 gap-10">
            <div className="card-premium flex gap-5 items-start">
              <Lock className="w-8 h-8 text-[#F5C044] flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2 text-white">Military-Grade Security</h3>
                <p className="text-muted text-base">End-to-end encrypted votes with blockchain verification for maximum security and transparency.</p>
              </div>
            </div>
            <div className="card-premium flex gap-5 items-start">
              <Users className="w-8 h-8 text-[#F5C044] flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2 text-white">Multi-Role Support</h3>
                <p className="text-muted text-base">Dedicated dashboards for admins, organizers, and voters with role-based access control.</p>
              </div>
            </div>
            <div className="card-premium flex gap-5 items-start">
              <BarChart3 className="w-8 h-8 text-[#F5C044] flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2 text-white">Real-Time Analytics</h3>
                <p className="text-muted text-base">Live result dashboards and comprehensive voting analytics to monitor elections in real-time.</p>
              </div>
            </div>
            <div className="card-premium flex gap-5 items-start">
              <CheckCircle className="w-8 h-8 text-[#F5C044] flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2 text-white">Fraud Detection</h3>
                <p className="text-muted text-base">Advanced fraud detection using IP tracking, device fingerprinting, and voting pattern analysis.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="card-premium max-w-3xl mx-auto text-center p-14">
          <h2 className="text-4xl font-bold mb-4 text-white tracking-tight">Ready to Get Started?</h2>
          <p className="text-muted mb-8 text-lg max-w-xl mx-auto">Join thousands of organizations using BlakVote for secure, transparent voting.</p>
          <button className="btn-primary text-lg px-10 py-4" onClick={() => router.push('/auth/sign-up')}>Create Your Account</button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#121218] py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center text-muted">
          <p>&copy; 2026 BlakVote. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
