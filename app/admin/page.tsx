'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { LIVE_EVENT_STATUSES } from '@/lib/event-status'
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
            .in('status', [...LIVE_EVENT_STATUSES]),
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold" />
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
    <div className="flex-1 space-y-8 p-4 md:p-8 text-foreground">
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform performance overview and system metrics.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>
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
    <div className="flex items-center justify-between border-b border-border/60 pb-4">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">All systems functional</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-success" />
        <span className="text-sm font-medium text-success">
          {status}
        </span>
      </div>
    </div>
  )
}
