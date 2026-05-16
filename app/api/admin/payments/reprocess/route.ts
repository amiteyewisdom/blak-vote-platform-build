import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { type PaymentProvider, reprocessConfirmedPaymentReference } from '@/lib/payment-processing'

/**
 * POST /api/admin/payments/reprocess
 *
 * Admin-only recovery endpoint for already-paid references that failed after
 * the provider confirmed payment. Paystack references are re-verified live.
 * NALO references are reprocessed from the stored payment row because there is
 * no reference-based verification API wired in this codebase.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])

    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const reference = String(body.reference ?? '').trim()
    const provider = typeof body.provider === 'string' ? (body.provider.trim().toLowerCase() as PaymentProvider) : undefined
    const status = typeof body.status === 'string' ? body.status.trim() : undefined
    const amount = Number.isFinite(Number(body.amount)) ? Number(body.amount) : undefined

    const result = await reprocessConfirmedPaymentReference({
      reference,
      provider,
      status,
      amount,
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment reprocess failed'
    console.error('Payment reprocess endpoint error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
