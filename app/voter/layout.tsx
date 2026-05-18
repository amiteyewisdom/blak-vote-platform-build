'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/header'

export default function VoterLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' })
        const payload = await res.json()

        if (!res.ok || !payload?.authenticated) {
          window.location.replace('/auth/login?redirectTo=%2Fvoter')
          return
        }

        if (payload.user?.role !== 'voter') {
          window.location.replace(payload.user?.role === 'admin' ? '/admin' : '/organizer')
          return
        }

        setUser(payload.user)
      } finally {
        setLoading(false)
      }
    }

    void loadUser()
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