import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

type PaystackBankRow = {
  name?: string
  code?: string
}

type PaystackResponse = {
  status?: boolean
  message?: string
  data?: PaystackBankRow[]
}

async function fetchPaystackOptions(path: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim()

  if (!secret) {
    throw new Error('Missing required environment variable: PAYSTACK_SECRET_KEY')
  }

  const response = await fetch(`https://api.paystack.co${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
    },
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => ({}))) as PaystackResponse

  if (!response.ok) {
    throw new Error(payload.message || 'Failed to load Paystack transfer options')
  }

  return Array.isArray(payload.data) ? payload.data : []
}

export async function GET() {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const [banks, mobileMoney] = await Promise.all([
      fetchPaystackOptions('/bank?currency=GHS'),
      fetchPaystackOptions('/bank?currency=GHS&type=mobile_money'),
    ])

    return NextResponse.json({
      banks: banks
        .filter((item) => item.code && item.name && item.name !== 'Bank of Ghana')
        .map((item) => ({ code: String(item.code), name: String(item.name) })),
      mobileMoney: mobileMoney
        .filter((item) => item.code && item.name)
        .map((item) => ({ code: String(item.code), name: String(item.name) })),
    })
  } catch (error) {
    console.error('Organizer withdrawal options error:', error)
    return NextResponse.json({ error: 'Failed to load withdrawal options' }, { status: 500 })
  }
}