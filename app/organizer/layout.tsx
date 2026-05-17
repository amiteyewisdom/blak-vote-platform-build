'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Header } from '@/components/header'
import { SidebarNav } from '@/components/sidebar-nav'
import { BarChart3, Plus, Settings, Wallet } from 'lucide-react'

export default function OrganizerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user ?? null)
      setLoading(false)
    }
    loadUser()
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold" />
      </div>
    )
  }

  const navItems = [
    { label: 'Dashboard', href: '/organizer', icon: BarChart3 },
    { label: 'Wallet', href: '/organizer/wallet', icon: Wallet },
    { label: 'New Event', href: '/organizer/create-event', icon: Plus },
    { label: 'Settings', href: '/organizer/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen flex max-w-full overflow-x-hidden bg-background text-foreground">
      <aside className="hidden md:block w-64 border-r border-border/60 bg-surface lg:w-72">
        <SidebarNav items={navItems} />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Header
          user={user}
          onToggleSidebar={() => setSidebarOpen((open: boolean) => !open)}
          sidebarOpen={sidebarOpen}
          homeHref="/organizer"
          settingsHref="/organizer/settings"
        />

        <div className={`fixed inset-0 z-40 md:hidden ${sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-background/60 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setSidebarOpen(false)}
          />
          <aside className={`relative h-full w-[min(78vw,17rem)] border-r border-border bg-surface p-3 shadow-2xl transform transition-transform duration-300 sm:p-4 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <SidebarNav items={navItems} onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>

        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}