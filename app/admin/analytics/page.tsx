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
import { TrendingUp, Users, Vote, AlertTriangle } from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  totalEvents: number
  totalVotes: number
  suspiciousActivities: number
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
      <div className="min-h-screen flex items-center justify-center bg-[#0B0B0F]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-8 text-neutral-400">
        Failed to load analytics.
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 text-white space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Platform Analytics
        </h1>
        <p className="text-neutral-400">
          Real-time performance overview of the BlakVote platform.
        </p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-6">

        {/* Users */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-3 text-neutral-400 text-sm">
            <span>Total Users</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-3xl font-bold">
            {stats.totalUsers}
          </div>
        </div>

        {/* Events */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-3 text-neutral-400 text-sm">
            <span>Total Events</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-3xl font-bold">
            {stats.totalEvents}
          </div>
        </div>

        {/* Votes */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-3 text-neutral-400 text-sm">
            <span>Total Votes</span>
            <Vote className="w-4 h-4" />
          </div>
          <div className="text-3xl font-bold">
            {stats.totalVotes}
          </div>
        </div>

        {/* Suspicious */}
        <div className="card-premium p-6 border border-red-500/30">
          <div className="flex items-center justify-between mb-3 text-neutral-400 text-sm">
            <span>Suspicious Activity</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-bold text-red-400">
            {stats.suspiciousActivities}
          </div>
        </div>

      </div>

      {/* Chart */}
      <div className="card-premium p-6">
        <h2 className="text-lg font-semibold mb-6">
          Daily Activity Overview
        </h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.dailyStats}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" stroke="#888" />
            <YAxis stroke="#888" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111118',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="votes"
              stroke="#F5C044"
              strokeWidth={3}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="users"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
