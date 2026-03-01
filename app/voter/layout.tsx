'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function VoterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data.session) {
        router.replace('/auth/sign-in')
        return
      }

      setLoading(false)
    }

    checkAuth()
  }, [])

  // ✅ LOADING GUARD (outside JSX)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05060D]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white bg-[#05060D]">
      <main className="p-10">
        {children}
      </main>
    </div>
  )
}
