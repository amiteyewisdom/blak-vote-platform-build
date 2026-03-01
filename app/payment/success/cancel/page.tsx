'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function PaymentSuccessPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-8">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center space-y-6 max-w-md w-full">

        {verifying && (
          <>
            <div className="animate-spin h-10 w-10 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto"></div>
            <h1 className="text-xl font-semibold">Verifying payment...</h1>
          </>
        )}

        {!verifying && error && (
          <>
            <div className="text-red-500 text-5xl">✖</div>
            <h1 className="text-2xl font-bold">Payment Failed</h1>
            <p className="text-gray-400">{error}</p>

            <button
              onClick={() => router.push('/')}
              className="w-full py-3 rounded-xl bg-yellow-500 text-black font-semibold hover:bg-yellow-400 transition"
            >
              Go Back
            </button>
          </>
        )}

        {!verifying && !error && (
          <>
            <div className="text-green-500 text-5xl">✔</div>
            <h1 className="text-2xl font-bold">Vote Successful</h1>
            <p className="text-gray-400">
              Your vote has been recorded successfully.
            </p>

            <button
              onClick={() => router.push('/')}
              className="w-full py-3 rounded-xl bg-yellow-500 text-black font-semibold hover:bg-yellow-400 transition"
            >
              Back to Home
            </button>
          </>
        )}

      </div>
    </div>
  )
}
