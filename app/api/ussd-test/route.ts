export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function ussdMenuResponse() {
  const body = 'CON Welcome to BlakVote\n1. Vote\n2. Ticketing'

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET() {
  return ussdMenuResponse()
}

export async function POST() {
  return ussdMenuResponse()
}
