'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

function LegacyVerifyRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const email = (searchParams.get('email') ?? '').trim().toLowerCase()
    const intent = searchParams.get('intent')

    if (email && intent === 'signup') {
      router.replace('/auth/signup')
      return
    }

    if (email && intent === 'reset') {
      router.replace('/auth/verify-reset?email=' + encodeURIComponent(email))
      return
    }

    router.replace('/auth/login')
  }, [router, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 size={24} className="animate-spin text-muted-foreground" />
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LegacyVerifyRedirect />
    </Suspense>
  )
}
