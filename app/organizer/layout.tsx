'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Header } from '@/components/header'
import { SidebarNav } from '@/components/sidebar-nav'
import { BarChart3, Plus, Settings } from 'lucide-react'

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
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
      <div className="min-h-screen flex items-center justify-center bg-[#05060D]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]" />
      </div>
    )
  }

  const navItems = [
    { label: 'Dashboard', href: '/organizer', icon: BarChart3 },
    { label: 'New Event', href: '/organizer/create-event', icon: Plus },
    { label: 'Settings', href: '/organizer/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen flex bg-[#05060D] text-white">
      <aside className="w-72 border-r border-white/5 bg-[#0E101A]">
        <SidebarNav items={navItems} />
      </aside>

      <div className="flex-1 flex flex-col">
        <Header user={user} />
        <main className="flex-1 p-10">{children}</main>
      </div>
    </div>
  )
}