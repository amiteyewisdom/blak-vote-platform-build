'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Users, Vote, DollarSign } from 'lucide-react'
import { DSCard } from '@/components/ui/design-system'

interface DashboardStats {
  totalUsers: number
  totalEvents: number
  totalVotes: number
  totalPlatformRevenue: number
  totalGrossRevenue: number
  totalRevenueTransactions: number
  providerBreakdown: Array<{
    provider: string
    total_platform_revenue: number
    total_gross_revenue: number
    total_transactions: number
  }>
  perEventRevenue: Array<{
    event_id: string
    event_title: string
    total_platform_revenue: number
    total_gross_revenue: number
    total_transactions: number
    last_transaction_at: string | null
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
      const dashboardRes = await fetch('/api/admin/dashboard', { cache: 'no-store' })
      const dashboardData = await dashboardRes.json()

      if (!dashboardRes.ok) {
        throw new Error(dashboardData?.error || 'Failed to fetch admin dashboard stats')
      }

      const revenueRes = await fetch('/api/admin/revenue')

      if (!revenueRes.ok) {
        throw new Error('Failed to fetch revenue analytics')
      }

      const revenueData = await revenueRes.json()
      const revenueSummary = revenueData.summary || {}
      const perEventRevenue = Array.isArray(revenueData.perEventRevenue)
        ? revenueData.perEventRevenue
        : []

      setStats({
        totalUsers: Number(dashboardData.totalUsers || 0),
        totalEvents: Number(dashboardData.totalEvents || 0),
        totalVotes: Number(dashboardData.totalVotes || 0),
        totalPlatformRevenue: Number(revenueSummary.total_platform_revenue || 0),
        totalGrossRevenue: Number(revenueSummary.total_gross_revenue || 0),
        totalRevenueTransactions: Number(revenueSummary.total_transactions || 0),
        providerBreakdown: Array.isArray(revenueData.providerBreakdown)
          ? revenueData.providerBreakdown
          : [],
        perEventRevenue,
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
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">

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

      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Revenue by Payment Source</h2>
          <p className="text-sm text-muted-foreground">Breakdown of fees collected from online and USSD payments.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {['paystack', 'nalo'].map((provider) => {
            const providerRow = stats.providerBreakdown.find((row) => row.provider === provider)
            const label = provider === 'paystack' ? 'Online (Paystack)' : 'USSD (Nalo)'

            return (
              <DSCard key={provider} className="p-5 border border-border/70">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="mt-3 text-2xl font-bold">
                  GHS {Number(providerRow?.total_platform_revenue || 0).toFixed(2)}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {Number(providerRow?.total_transactions || 0)} transactions
                </div>
              </DSCard>
            )
          })}
        </div>
      </div>

      <DSCard className="p-6 border border-emerald-500/30">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>Combined Platform Revenue</span>
          <DollarSign className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-3xl font-bold text-emerald-300">
          GHS {stats.totalPlatformRevenue.toFixed(2)}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {stats.totalRevenueTransactions} transactions
        </div>
      </DSCard>

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

    </div>
  )
}
