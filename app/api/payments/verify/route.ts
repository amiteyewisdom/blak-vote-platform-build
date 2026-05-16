import { NextRequest } from 'next/server'
import { handlePaymentVerificationRequest } from '@/lib/payment-route-security'

export async function POST(request: NextRequest) {
  return handlePaymentVerificationRequest(request, 'app/api/payments/verify')
}
