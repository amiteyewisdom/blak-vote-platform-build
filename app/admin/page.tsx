'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BarChart3, Loader2, RotateCcw, Users, Zap } from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  totalEvents: number
  totalVotes: number
  activeEvents: number
}

type PaymentProviderOption = 'auto' | 'paystack' | 'nalo' | 'paypal'

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [reprocessReference, setReprocessReference] = useState('')
  const [reprocessProvider, setReprocessProvider] = useState<PaymentProviderOption>('auto')
  const [reprocessLoading, setReprocessLoading] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/dashboard', { cache: 'no-store' })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to fetch dashboard stats')
        }

        setStats({
          totalUsers: Number(payload.totalUsers || 0),
          totalEvents: Number(payload.totalEvents || 0),
          totalVotes: Number(payload.totalVotes || 0),
          activeEvents: Number(payload.activeEvents || 0),
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
    <div className="flex-1 space-y-6 p-3 text-foreground sm:p-4 md:space-y-8 md:p-8">
      <div className="space-y-2">
        <h1 className="text-xl font-bold sm:text-2xl md:text-3xl">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Platform performance overview and system metrics.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground sm:text-3xl">
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

      <Card>
        <CardHeader>
          <CardTitle>Payment Recovery</CardTitle>
          <CardDescription>
            Reprocess an already-paid reference that failed after provider confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end md:gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reference</label>
              <Input
                value={reprocessReference}
                onChange={(event) => setReprocessReference(event.target.value)}
                placeholder="PAY-... or USSD-..."
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Provider</label>
              <Select
                value={reprocessProvider}
                onValueChange={(value) => setReprocessProvider(value as PaymentProviderOption)}
              >
                <SelectTrigger className="h-11 rounded-xl bg-card">
                  <SelectValue placeholder="Auto detect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto detect</SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                  <SelectItem value="nalo">NALO / USSD</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              className="h-11 w-full md:w-auto"
              disabled={reprocessLoading || !reprocessReference.trim()}
              onClick={async () => {
                const reference = reprocessReference.trim()
                if (!reference) {
                  return
                }

                setReprocessLoading(true)
                setReprocessResult(null)

                try {
                  const response = await fetch('/api/admin/payments/reprocess', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      reference,
                      ...(reprocessProvider === 'auto' ? {} : { provider: reprocessProvider }),
                    }),
                  })

                  const payload = await response.json().catch(() => ({}))
                  const successMessage =
                    payload?.resource === 'vote'
                      ? `Vote reprocessed successfully for ${reference}.`
                      : payload?.resource === 'ticket'
                        ? `Ticket payment reprocessed successfully for ${reference}.`
                        : `Payment reprocessed successfully for ${reference}.`

                  setReprocessResult({
                    ok: response.ok,
                    message: response.ok ? successMessage : String(payload?.error || 'Reprocess failed'),
                  })
                } catch (error) {
                  setReprocessResult({
                    ok: false,
                    message: error instanceof Error ? error.message : 'Reprocess failed',
                  })
                } finally {
                  setReprocessLoading(false)
                }
              }}
            >
              {reprocessLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reprocess
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Use this only for references that were already charged or confirmed by the provider.
          </p>

          {reprocessResult && (
            <div
              className={reprocessResult.ok
                ? 'rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success'
                : 'rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'}
            >
              {reprocessResult.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
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
