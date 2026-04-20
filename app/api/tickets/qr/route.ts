import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

function normalizeTicketCode(input: unknown): string {
  return typeof input === 'string' ? input.trim().toUpperCase() : ''
}

function isValidTicketCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6,32}$/.test(code)
}

function getSiteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export async function GET(req: NextRequest) {
  try {
    const code = normalizeTicketCode(req.nextUrl.searchParams.get('code'))

    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 })
    }

    if (!isValidTicketCodeFormat(code)) {
      return NextResponse.json({ error: 'Invalid ticket code format' }, { status: 400 })
    }

    // The QR payload is the public verification URL — no sensitive data embedded.
    const verifyUrl = `${getSiteBaseUrl()}/api/tickets/verify?code=${code}`

    const dataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })

    return NextResponse.json({ dataUrl, code, verifyUrl })
  } catch (error) {
    return NextResponse.json(
      { error: 'QR generation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
