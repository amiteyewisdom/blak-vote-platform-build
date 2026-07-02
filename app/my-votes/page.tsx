'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, History, Loader2, Search, Ticket, Vote } from 'lucide-react'

type HistoryItem = {
  id: string
  reference: string
  amount: number
  created_at: string
  voter_name: string | null
  event_title: string | null
  resource: 'vote' | 'ticket'
  ticket_codes: string[]
  candidate_name: string | null
}

export default function MyVotesPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() && !phone.trim()) {
      setError('Enter your email or phone number')
      return
    }
    setLoading(true)
    setError(null)
    setHistory(null)
    try {
      const params = new URLSearchParams()
      if (email.trim()) params.set('email', email.trim())
      if (phone.trim()) params.set('phone', phone.trim())
      const res = await fetch(`/api/payments/my-history?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to load history')
        return
      }
      setHistory(data.history || [])
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">

        <div>
          <button
            onClick={() => router.push('/events')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm"
          >
            <ArrowLeft size={16} />
            Back to Events
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center">
              <History className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">My Votes & Tickets</h1>
              <p className="text-sm text-muted-foreground">Look up your transaction history</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleLookup} className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Enter the email or phone number you used when voting or buying tickets.</p>
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span>or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold text-gold-foreground font-semibold py-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Looking up…' : 'Look Up History'}
          </button>
        </form>

        {history !== null && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {history.length} transaction{history.length !== 1 ? 's' : ''} found
            </h2>

            {history.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
                No transactions found for this email or phone.
              </div>
            )}

            {history.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.resource === 'ticket' ? 'bg-violet-500/15 text-violet-400' : 'bg-gold/15 text-gold'}`}>
                      {item.resource === 'ticket' ? <Ticket className="w-4 h-4" /> : <Vote className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{item.event_title || 'Unknown Event'}</p>
                      {item.candidate_name && (
                        <p className="text-xs text-muted-foreground">Voted for: {item.candidate_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gold text-sm">GHS {item.amount.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {item.ticket_codes.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/40 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Ticket Code{item.ticket_codes.length > 1 ? 's' : ''}</p>
                    <div className="flex flex-wrap gap-2">
                      {item.ticket_codes.map((code) => (
                        <code key={code} className="text-xs font-mono bg-background border border-border rounded px-2 py-1">
                          {code}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground break-all">Ref: {item.reference}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
