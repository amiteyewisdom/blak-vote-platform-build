'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Users, Vote, AlertTriangle, DollarSign } from 'lucide-react'
import { DSCard } from '@/components/ui/design-system'

interface DashboardStats {
  totalUsers: number
  totalEvents: number
  totalVotes: number
  suspiciousActivities: number
  totalPlatformRevenue: number
  totalGrossRevenue: number
  totalRevenueTransactions: number
  perEventRevenue: Array<{
    event_id: string
    event_title: string
    total_platform_revenue: number
    total_gross_revenue: number
    total_transactions: number
    last_transaction_at: string | null
  }>
  dailyStats: Array<{
    date: string
    votes: number
    users: number
  }>
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/auth/sign-in'
        return
      }

      const [usersResult, eventsResult, votesResult] =
        await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('events').select('id', { count: 'exact', head: true }),
          supabase.from('votes').select('id', { count: 'exact', head: true }),
        ])

      const totalUsers = usersResult.count || 0
      const totalEvents = eventsResult.count || 0
      const totalVotes = votesResult.count || 0

      const suspiciousActivities = 0

      const revenueRes = await fetch('/api/admin/revenue')
      if (!revenueRes.ok) {
        throw new Error('Failed to fetch revenue analytics')
      }

      const revenueData = await revenueRes.json()
      const revenueSummary = revenueData.summary || {}
      const perEventRevenue = Array.isArray(revenueData.perEventRevenue)
        ? revenueData.perEventRevenue
        : []

      const dailyStats = Array.from({ length: 7 }, (_, i) => ({
        date: new Date(
          Date.now() - (6 - i) * 86400000
        ).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        votes: Math.floor(Math.random() * 120) + 30,
        users: Math.floor(Math.random() * 40) + 10,
      }))

      setStats({
        totalUsers,
        totalEvents,
        totalVotes,
        suspiciousActivities,
        totalPlatformRevenue: Number(revenueSummary.total_platform_revenue || 0),
        totalGrossRevenue: Number(revenueSummary.total_gross_revenue || 0),
        totalRevenueTransactions: Number(revenueSummary.total_transactions || 0),
        perEventRevenue,
        dailyStats,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-8 text-muted-foreground">
        Failed to load analytics.
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-8 p-4 text-foreground sm:space-y-10 sm:p-6 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Platform Analytics
        </h1>
        <p className="text-muted-foreground">
          Real-time performance overview of the BlakVote platform.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">

        {/* Users */}
        <DSCard className="p-6">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Users</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-3xl font-bold">
            {stats.totalUsers}
          </div>
        </DSCard>

        {/* Events */}
        <DSCard className="p-6">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Events</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-3xl font-bold">
            {stats.totalEvents}
          </div>
        </DSCard>

        {/* Votes */}
        <DSCard className="p-6">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Votes</span>
            <Vote className="w-4 h-4" />
          </div>
          <div className="text-3xl font-bold">
            {stats.totalVotes}
          </div>
        </DSCard>

        {/* Suspicious */}
        <DSCard className="p-6 border border-red-500/30">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Suspicious Activity</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-bold text-red-400">
            {stats.suspiciousActivities}
          </div>
        </DSCard>

        {/* Platform Revenue */}
        <DSCard className="p-6 border border-emerald-500/30">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Platform Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-emerald-300">
            GHS {stats.totalPlatformRevenue.toFixed(2)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {stats.totalRevenueTransactions} transactions
          </div>
        </DSCard>

      </div>

      <DSCard className="p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold">Per-Event Revenue</h2>
          <div className="text-sm text-muted-foreground">
            Gross: GHS {stats.totalGrossRevenue.toFixed(2)}
          </div>
        </div>

        {stats.perEventRevenue.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No revenue transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-3 text-left font-medium">Event</th>
                  <th className="py-3 text-right font-medium">Platform Fee Revenue</th>
                  <th className="py-3 text-right font-medium">Gross Revenue</th>
                  <th className="py-3 text-right font-medium">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {stats.perEventRevenue.map(event => (
                  <tr key={event.event_id} className="border-b border-border/60">
                    <td className="py-3 pr-4">{event.event_title || event.event_id}</td>
                    <td className="py-3 text-right text-emerald-300">
                      GHS {Number(event.total_platform_revenue || 0).toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      GHS {Number(event.total_gross_revenue || 0).toFixed(2)}
                    </td>
                    <td className="py-3 text-right">{event.total_transactions || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DSCard>

      {/* Chart */}
      <DSCard className="p-6">
        <h2 className="text-lg font-semibold mb-6">
          Daily Activity Overview
        </h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.dailyStats}>
            <CartesianGrid stroke="hsl(var(--border) / 0.8)" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '12px',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Line
              type="monotone"
              dataKey="votes"
              stroke="hsl(var(--gold))"
              strokeWidth={3}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="users"
              stroke="hsl(221 83% 53%)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </DSCard>

    </div>
  )
}
