import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';

// Centralized error handler
function handleError(error: unknown, message = 'Internal server error', status = 500) {
  console.error(message, error);
  return NextResponse.json({ error: message }, { status });
}

// Simple in-memory rate limiter (for demonstration; use Redis or similar for production)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitMap = new Map<string, { count: number; lastRequest: number }>();

// Zod schema for input validation
const paymentSchema = z.object({
  email: z.string().email(),
  amount: z.number().positive(),
  nomineeId: z.string().min(1),
  eventId: z.string().min(1),
  votes: z.number().int().positive(),
});
type PaymentRequest = z.infer<typeof paymentSchema>;

const PAYSTACK_URL = 'https://api.paystack.co/transaction/initialize';
const REFERENCE_PREFIX = 'BV-';
const AMOUNT_MULTIPLIER = 100;
const CALLBACK_PATH = '/payment-success';

// Validate callback_url
function validateCallbackUrl(siteUrl: string | undefined, path: string): string {
  if (!siteUrl || typeof siteUrl !== 'string' || !siteUrl.trim().toLowerCase().startsWith('http')) {
    throw new Error('Invalid callback base URL');
  }
  // Ensure no double slashes and proper joining
  let base = siteUrl.trim().replace(/\/$/, '');
  let p = path.trim().startsWith('/') ? path.trim() : '/' + path.trim();
  return base + p;
}

function getRateLimitKey(email: string | undefined, req: Request): string {
  if (email) return email;
  return req.headers.get('x-forwarded-for') || 'unknown';
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parseResult = paymentSchema.safeParse(body);
    if (!parseResult.success) {
      return handleError(parseResult.error.errors, 'Invalid input', 400);
    }
    const { email, amount, nomineeId, eventId, votes }: PaymentRequest = parseResult.data;

    // Rate limiting
    const key = getRateLimitKey(email, req);
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (entry && now - entry.lastRequest < RATE_LIMIT_WINDOW_MS) {
      if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        return handleError(null, 'Too many requests. Please try again later.', 429);
      }
      entry.count++;
      entry.lastRequest = now;
      rateLimitMap.set(key, entry);
    } else {
      rateLimitMap.set(key, { count: 1, lastRequest: now });
    }

    // Generate unique payment reference
    const reference = REFERENCE_PREFIX + crypto.randomBytes(8).toString('hex');

    // Initialize Paystack transaction with retry logic
    const maxRetries = 3;
    let response: Response | null = null;
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch(
          PAYSTACK_URL,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              amount: amount * AMOUNT_MULTIPLIER,
              reference,
              metadata: {
                nomineeId,
                eventId,
                votes,
              },
              callback_url: validateCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL, CALLBACK_PATH),
            }),
          }
        );
        break;
      } catch (err) {
        lastError = err;
        console.error(`Paystack fetch attempt ${attempt} failed:`, err);
        if (attempt < maxRetries) {
          await new Promise(res => setTimeout(res, 500 * attempt)); // Exponential backoff
        }
      }
    }
    if (!response) {
      return handleError(lastError, 'Failed to initialize payment after retries', 502);
    }

    // Parse Paystack response
    const data = await response.json();

    // Handle Paystack errors
    if (!response.ok) {
      return handleError(data, data.message || 'Paystack error', 500);
    }

    // Return authorization URL and reference to client
    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference,
    });
  } catch (error) {
    return handleError(error, 'Payment initialization failed', 500);
  }
}