import { handlePaystackWebhookRequest } from '@/lib/payment-route-security'

export async function POST(request: Request) {
  return handlePaystackWebhookRequest(request, 'app/api/paystack/webhook')
}