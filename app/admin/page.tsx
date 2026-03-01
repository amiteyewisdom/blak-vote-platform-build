'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, BarChart3, Zap } from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  totalEvents: number
  totalVotes: number
  activeEvents: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [
          { count: usersCount },
          { count: eventsCount },
          { count: votesCount },
          { count: activeEventsCount },
        ] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('events').select('*', { count: 'exact', head: true }),
          supabase.from('votes').select('*', { count: 'exact', head: true }),
          supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published'),
        ])

        setStats({
          totalUsers: usersCount || 0,
          totalEvents: eventsCount || 0,
          totalVotes: votesCount || 0,
          activeEvents: activeEventsCount || 0,
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0B0F]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]" />
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      icon: Users,
      description: 'Registered platform users',
    },
    {
      title: 'Total Events',
      value: stats?.totalEvents || 0,
      icon: BarChart3,
      description: 'Voting events created',
    },
    {
      title: 'Active Events',
      value: stats?.activeEvents || 0,
      icon: Zap,
      description: 'Currently published events',
    },
  ]

  return (
    <div className="flex-1 space-y-8 p-8 text-white">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-neutral-400">
          Platform performance overview and system metrics.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="bg-[#111118] border-white/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-neutral-400">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-[#F5C044]" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">
                  {stat.value}
                </div>
                <p className="text-xs text-neutral-500">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-[#111118] border-white/5">
        <CardHeader>
          <CardTitle className="text-white">System Status</CardTitle>
          <CardDescription className="text-neutral-400">
            Core platform monitoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatusRow label="Database" status="Operational" />
          <StatusRow label="Authentication" status="Operational" />
          <StatusRow label="Payments" status="Operational" />
        </CardContent>
      </Card>
    </div>
  )
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-4">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-neutral-400">All systems functional</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-green-500 rounded-full" />
        <span className="text-sm font-medium text-green-400">
          {status}
        </span>
      </div>
    </div>
  )
}
