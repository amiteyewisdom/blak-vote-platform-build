import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

type PaystackResolveResponse = {
  status?: boolean
  message?: string
  data?: {
    account_name?: string
    account_number?: string
    bank_id?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.trim() : ''
    const bankCode = typeof body.bankCode === 'string' ? body.bankCode.trim() : ''
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim()

    if (!secret) {
      return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 })
    }

    if (!accountNumber || !bankCode) {
      return NextResponse.json({ error: 'accountNumber and bankCode are required' }, { status: 400 })
    }

    const searchParams = new URLSearchParams({
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'GHS',
    })

    const response = await fetch(`https://api.paystack.co/bank/resolve?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: 'no-store',
    })

    const payload = (await response.json().catch(() => ({}))) as PaystackResolveResponse

    if (!response.ok) {
      return NextResponse.json({ error: payload.message || 'Unable to verify bank account' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      accountName: payload.data?.account_name || '',
      accountNumber: payload.data?.account_number || accountNumber,
      bankId: payload.data?.bank_id || null,
    })
  } catch (error) {
    console.error('Resolve organizer withdrawal account error:', error)
    return NextResponse.json({ error: 'Failed to verify bank account' }, { status: 500 })
  }
}