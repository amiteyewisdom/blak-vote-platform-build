'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Header } from '@/components/header'
import { SidebarNav } from '@/components/sidebar-nav'
import { BarChart3, Users, Settings, CreditCard, Calendar, FileCheck, ScrollText } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
    { label: 'Dashboard', href: '/admin', icon: BarChart3 },
    { label: 'Events', href: '/admin/events', icon: Calendar },
    { label: 'Audit', href: '/admin/audit', icon: ScrollText },
    { label: 'Withdrawals', href: '/admin/withdrawals', icon: CreditCard },
    { label: 'Applications', href: '/admin/applications', icon: FileCheck },
    { label: 'Users', href: '/admin/users', icon: Users },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen flex max-w-full overflow-x-hidden bg-background text-foreground">
      <aside className="hidden md:block w-60 border-r border-border/60 bg-surface">
        <SidebarNav items={navItems} />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Header
          user={user}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          sidebarOpen={sidebarOpen}
        />

        <div className={`fixed inset-0 z-40 md:hidden ${sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-background/60 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setSidebarOpen(false)}
          />
          <aside className={`relative h-full w-[min(82vw,18rem)] border-r border-border bg-surface p-4 shadow-2xl transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <SidebarNav items={navItems} onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>

        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}