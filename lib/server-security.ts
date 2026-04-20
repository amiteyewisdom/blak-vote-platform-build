import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Sliding-window in-process rate limiter.
// NOTE: State is per-instance. For multi-instance deployments replace with a
// shared store such as Redis / Upstash.
// ---------------------------------------------------------------------------
interface RateLimitBucket {
  timestamps: number[]
}

const rateLimitStore = new Map<string, RateLimitBucket>()

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const windowStart = now - windowMs
  const bucket = rateLimitStore.get(key) ?? { timestamps: [] }

  // Drop timestamps that have fallen outside the window.
  bucket.timestamps = bucket.timestamps.filter(t => t > windowStart)

  if (bucket.timestamps.length >= maxRequests) {
    // Oldest timestamp determines when the caller can retry.
    const retryAfterMs = bucket.timestamps[0] + windowMs - now
    rateLimitStore.set(key, bucket)
    return { allowed: false, retryAfterMs }
  }

  bucket.timestamps.push(now)
  rateLimitStore.set(key, bucket)
  return { allowed: true, retryAfterMs: 0 }
}

function requireEnv(name: string): string {
  const value = process.env[name]

  // Centralized env validation prevents partial runtime failures later in handlers.
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getSupabaseAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    requireEnv('NEXT_PUBLIC_SUPABASE_URL')

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  // Use a single admin-client constructor to avoid key drift across API routes.
  return createClient(url, key)
}

export function extractClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')

  if (forwardedFor) {
    // Proxies can append multiple values: client, proxy1, proxy2.
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')

  return realIp?.trim() || 'unknown'
}

export function isValidPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) {
    return false
  }

  const secret = process.env.PAYSTACK_SECRET_KEY

  if (!secret) {
    throw new Error('Missing required environment variable: PAYSTACK_SECRET_KEY')
  }

  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected, 'hex')
  const receivedBuffer = Buffer.from(signature, 'hex')

  // timingSafeEqual avoids leaking signature information through timing side channels.
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}
