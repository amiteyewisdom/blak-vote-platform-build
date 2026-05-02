import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const url = request.nextUrl.clone()

  // 👉 app.blakvote.com → redirect to /organizer
  if (host.startsWith('app.')) {
    if (!url.pathname.startsWith('/organizer')) {
      url.pathname = `/organizer${url.pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // 👉 blakvote.com → public (no change)
  return NextResponse.next()
}