'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const reference = searchParams.get('reference')

  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reference) {
      setError('Invalid payment reference')
      setVerifying(false)
      return
    }

    const verifyPayment = async () => {
      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reference })
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Verification failed')
        }

      } catch (err) {
        setError('Verification failed')
      } finally {
        setVerifying(false)
      }
    }

    verifyPayment()
  }, [reference])

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

            <Button
              onClick={() => router.push('/')}
              className="w-full"
            >
              Go Back
            </Button>
          </>
        )}

        {!verifying && !error && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="text-2xl font-bold">Vote Successful</h1>
            <p className="text-muted-foreground">
              Your vote has been recorded successfully.
            </p>

            <Button
              onClick={() => router.push('/')}
              className="w-full"
            >
              Back to Home
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
