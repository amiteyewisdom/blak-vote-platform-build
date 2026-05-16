import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const BASE_CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

// ---------------------------------------------------------------------------
// Sliding-window in-process rate limiter.
// NOTE: State is per-instance. For multi-instance deployments replace with a
// shared store such as Redis / Upstash.
// ---------------------------------------------------------------------------
interface RateLimitBucket {
  timestamps: number[]
}

const PASSWORD_MIN_LENGTH = 10
const PASSWORD_MAX_LENGTH = 128

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

function normalizeIpValue(value: string): string {
  const trimmed = value.trim().toLowerCase()

  if (!trimmed) {
    return ''
  }

  const withoutIpv6Prefix = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed
  const unwrapped = withoutIpv6Prefix.replace(/^\[|\]$/g, '')

  if (unwrapped.includes('.') && unwrapped.includes(':')) {
    return unwrapped.slice(0, unwrapped.lastIndexOf(':'))
  }

  return unwrapped
}

function extractClientIpCandidates(request: Request): string[] {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')

  const candidates: string[] = []

  if (forwardedFor) {
    for (const item of forwardedFor.split(',')) {
      const normalized = normalizeIpValue(item)
      if (normalized) {
        candidates.push(normalized)
      }
    }
  }

  if (realIp) {
    const normalized = normalizeIpValue(realIp)
    if (normalized) {
      candidates.push(normalized)
    }
  }

  const firstIp = normalizeIpValue(extractClientIp(request))
  if (firstIp) {
    candidates.push(firstIp)
  }

  return [...new Set(candidates)]
}

export function getAllowedIps(envName: string, fallbackIps: string[] = []): string[] {
  const configured = process.env[envName]

  if (!configured) {
    return fallbackIps
  }

  return configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

export function isRequestFromAllowedIps(request: Request, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) {
    return true
  }

  const normalizedAllowedIps = allowedIps.map(normalizeIpValue).filter(Boolean)
  const requestIps = extractClientIpCandidates(request)

  if (requestIps.length === 0) {
    return false
  }

  return requestIps.some(ip => normalizedAllowedIps.includes(ip))
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

export function hasTrustedOrigin(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin
  const originHeader = request.headers.get('origin')
  const refererHeader = request.headers.get('referer')

  if (originHeader) {
    try {
      return new URL(originHeader).origin === requestOrigin
    } catch {
      return false
    }
  }

  if (refererHeader) {
    try {
      return new URL(refererHeader).origin === requestOrigin
    } catch {
      return false
    }
  }

  return true
}

export function applyNoStoreHeaders<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  response.headers.set('Expires', '0')
  response.headers.set('Pragma', 'no-cache')
  return response
}

export function getRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)))
}

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.'
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.'
  }

  if (!/\d/.test(password)) {
    return 'Password must include at least one number.'
  }

  return null
}

export function applySecurityHeaders<T extends Response>(response: T): T {
  response.headers.set('Content-Security-Policy', BASE_CONTENT_SECURITY_POLICY)
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site')
  response.headers.set('Origin-Agent-Cluster', '?1')
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Frame-Options', 'DENY')

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  return response
}
