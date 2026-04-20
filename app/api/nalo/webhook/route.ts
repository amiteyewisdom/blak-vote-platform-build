import { handleNaloWebhookRequest } from '@/lib/nalo-payment'

export async function POST(request: Request) {
  return handleNaloWebhookRequest(request)
}