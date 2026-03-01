'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const reference = searchParams.get('reference')

  useEffect(() => {
    if (!reference) return

    // You can verify payment here later
    console.log('Payment reference:', reference)
  }, [reference])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-8">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center space-y-6 max-w-md w-full">

        <div className="text-green-500 text-5xl">✔</div>

        <h1 className="text-2xl font-bold">Payment Successful</h1>

        <p className="text-gray-400">
          Your vote has been received successfully.
        </p>

        {reference && (
          <p className="text-xs text-gray-500 break-all">
            Reference: {reference}
          </p>
        )}

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 rounded-xl bg-yellow-500 text-black font-semibold hover:bg-yellow-400 transition"
        >
          Back to Home
        </button>

      </div>
    </div>
  )
}
