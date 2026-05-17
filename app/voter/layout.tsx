'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/header'
import { supabase } from '@/lib/supabaseClient'

export default function VoterLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user ?? null)
      setLoading(false)
    }

    loadUser()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header user={user} homeHref="/voter" settingsHref="/voter" settingsLabel="Dashboard" />
      <main className="overflow-x-hidden">{children}</main>
    </div>
  )
}