import { NextRequest } from 'next/server'
import { handlePaymentInitializeRequest } from '@/lib/payment-route-security'

export async function POST(request: NextRequest) {
  return handlePaymentInitializeRequest(request, 'app/api/payments/initialize')
}
