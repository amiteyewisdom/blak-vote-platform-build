import { NextResponse } from 'next/server';
import { paymentService } from '@/lib/payment-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await paymentService.initiatePayment(body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Payment initialization failed', error);
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 });
  }
}