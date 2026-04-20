'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { TicketQRCode } from '@/components/TicketQRCode'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const reference = searchParams.get('reference')

  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)  // ✅ CRITICAL FIX #3: Prevent double verification
  const [error, setError] = useState<string | null>(null)
  const [resourceType, setResourceType] = useState<'vote' | 'ticket'>('vote')
  const [ticketCode, setTicketCode] = useState<string | null>(null)
  const [ticketCodes, setTicketCodes] = useState<string[]>([])

  useEffect(() => {
    if (verified) return  // ✅ EXIT EARLY if already verified

    if (!reference) {
      setError('Invalid payment reference')
      setVerifying(false)
      return
    }

    let isMounted = true  // ✅ Prevent state updates after unmount

    const verifyPayment = async () => {
      // ✅ HIGH FIX #2: Add fetch timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)  // 10 second timeout

      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reference }),
          signal: controller.signal,  // ✅ Pass signal for abort
        })

        const data = await res.json()

        if (!isMounted) return  // ✅ Don't update state if unmounted

        if (!res.ok) {
          setError(data.error || 'Verification failed')
          return
        }

        setResourceType(data.resource === 'ticket' ? 'ticket' : 'vote')
        setTicketCode(data.ticketCode || null)
        setTicketCodes(Array.isArray(data.ticketCodes) ? data.ticketCodes.filter(Boolean) : data.ticketCode ? [data.ticketCode] : [])
        setVerified(true)  // ✅ Mark as verified to prevent re-runs
      } catch (err) {
        if (!isMounted) return

        if (err instanceof Error && err.name === 'AbortError') {
          setError('Verification timed out. Your payment may have succeeded. Please refresh the page.')
          console.error('Payment verification timeout:', reference)
        } else {
          setError('Verification failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
          console.error('Payment verification error:', err, { reference })
        }
      } finally {
        clearTimeout(timeoutId)  // ✅ Clear timeout
        if (isMounted) setVerifying(false)
      }
    }

    void verifyPayment()

    // ✅ Cleanup function for unmount
    return () => {
      isMounted = false
    }
  }, [reference, verified])  // ✅ Add verified to dependency list

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-10 text-center shadow-[0_20px_60px_hsl(var(--foreground)/0.1)]">

        {verifying && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
            <h1 className="text-xl font-semibold">Verifying payment...</h1>
          </>
        )}

        {!verifying && error && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="text-2xl font-bold">Payment Failed</h1>
            <p className="text-muted-foreground">{error}</p>
            {reference && (
              <p className="text-xs text-muted-foreground break-all">Reference: {reference}</p>
            )}

            <div className="rounded-xl border border-border bg-secondary/70 p-4 text-left text-sm">
              <p className="font-semibold mb-2">What to do next:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Check your bank or payment method</li>
                <li>Try refreshing this page</li>
                <li>Contact support if problem persists</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => window.location.reload()}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
              <Button
                onClick={() => router.push('/')}
                variant="secondary"
                className="flex-1"
              >
                Go Home
              </Button>
            </div>
          </>
        )}

        {!verifying && !error && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="text-2xl font-bold">{resourceType === 'ticket' ? 'Ticket Payment Successful' : 'Vote Successful'}</h1>
            <p className="text-muted-foreground">
              {resourceType === 'ticket'
                ? 'Your ticket payment was successful and your ticket has been issued.'
                : 'Your payment was confirmed and your vote has been recorded.'}
            </p>

            {resourceType === 'ticket' && (ticketCodes.length > 0 || ticketCode) && (
              <div className="space-y-4 text-left">
                <p className="text-sm font-semibold text-center">
                  Your ticket{(ticketCodes.length > 1) ? 's' : ''} — save or screenshot the QR code{(ticketCodes.length > 1) ? 's' : ''} below
                </p>
                <div className="flex flex-wrap justify-center gap-6">
                  {(ticketCodes.length > 0 ? ticketCodes : ticketCode ? [ticketCode] : []).map((code) => (
                    <TicketQRCode key={code} code={code} label={code} size={180} />
                  ))}
                </div>
              </div>
            )}

            {reference && (
              <p className="text-xs text-muted-foreground break-all">
                Reference: {reference}
              </p>
            )}

            <Button
              onClick={() => router.push('/events')}
              className="w-full"
            >
              {resourceType === 'ticket' ? 'Back To Events' : 'View All Events'}
            </Button>
          </>
        )}

      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
          <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-10 text-center shadow-[0_20px_60px_hsl(var(--foreground)/0.1)]">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
            <h1 className="text-xl font-semibold">Loading...</h1>
          </div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  )
}

