export const ACCESS_COOKIE_NAME = 'blakvote_access'
export const REFRESH_COOKIE_NAME = 'blakvote_refresh'
export const RESET_COOKIE_NAME = 'blakvote_reset'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const RESET_TOKEN_TTL_SECONDS = 15 * 60

export type AccessTokenPayload = {
  type: 'access'
  sub: string
  sid: string
  email: string
  role: 'admin' | 'organizer' | 'voter'
  full_name?: string
  first_name?: string
  last_name?: string
  iat: number
  exp: number
}

export type ResetTokenPayload = {
  type: 'reset'
  email: string
  otp_id: string
  iat: number
  exp: number
}

type JwtPayload = Record<string, string | number | boolean | null | undefined>

function getJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET

  if (!secret) {
    throw new Error('Missing AUTH_JWT_SECRET or SESSION_SECRET environment variable.')
  }

  return secret
}

function base64UrlEncode(input: string | Uint8Array) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(String.fromCharCode(...bytes))

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const bytes =
    typeof Buffer !== 'undefined'
      ? new Uint8Array(Buffer.from(padded, 'base64'))
      : Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function signParts(header: string, payload: string, secret: string) {
  const key = await importSigningKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  )

  return base64UrlEncode(new Uint8Array(signature))
}

export async function signSessionToken<T extends JwtPayload>(
  payload: Omit<T, 'iat' | 'exp'>,
  ttlSeconds: number
) {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  }
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))
  const signature = await signParts(encodedHeader, encodedPayload, getJwtSecret())

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export async function verifySessionToken<T extends JwtPayload>(token: string): Promise<T | null> {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.')
    if (!encodedHeader || !encodedPayload || !signature) {
      return null
    }

    const key = await importSigningKey(getJwtSecret())
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      Uint8Array.from(
        typeof Buffer !== 'undefined'
          ? Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
          : atob(signature.replace(/-/g, '+').replace(/_/g, '/')).split('').map((char) => char.charCodeAt(0))
      ),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    )

    if (!isValid) {
      return null
    }

    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as T & { exp?: number }

    if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}