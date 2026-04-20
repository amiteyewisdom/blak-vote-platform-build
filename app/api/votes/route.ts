import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isLiveEventStatus } from '@/lib/event-status'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  extractClientIp,
  getSupabaseAdminClient,
  checkRateLimit,
} from '@/lib/server-security'

// ---------------------------------------------------------------------------
// Input schema — UUIDs prevent injection; phone regex blocks malformed values.
// ---------------------------------------------------------------------------
const voteSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID'),
  candidateId: z.string().uuid('candidateId must be a valid UUID'),
  // Quantity is validated after pricing — kept here for type safety only.
  quantity: z.number().int().min(1).max(1000),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format')
    .optional(),
})

function getSupabaseClient() {
  return getSupabaseAdminClient()
}

export async function POST(request: NextRequest) {
  try {
    // =========================================================================
    // PAYMENT-FIRST VOTING: All votes must go through payment verification
    // =========================================================================
    // 
    // This endpoint is now disabled. All voting must:
    // 1. Call /api/payments/initialize with eventId, candidateId, quantity, email
    // 2. Redirect to Paystack (or skip payment for free events)
    // 3. Verify payment at /api/payments/verify
    // 4. Vote is created ONLY after payment verification via process_vote RPC
    //
    // This ensures:
    // ✓ All votes have consistent payment tracking
    // ✓ No duplicate votes can be created outside the payment flow
    // ✓ Audit trail captures vote source correctly
    // ✓ Rate limiting applies uniformly across all voters
    // =========================================================================

    return NextResponse.json(
      {
        error: 'Direct vote creation is disabled. All votes must go through the payment flow.',
        instructions: 'POST /api/payments/initialize with eventId, candidateId, quantity, email. Vote created after payment verification.',
      },
      { status: 403 }
    )
  } catch (error: any) {
    console.error('Vote endpoint error:', error.message)

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
