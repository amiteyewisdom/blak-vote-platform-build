function ussdMenuResponse() {
  const body = 'CON Welcome to BlakVote\n1. Vote\n2. Ticketing'

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': String(new TextEncoder().encode(body).length),
    },
  })
}

export async function GET() {
  return ussdMenuResponse()
}

export async function POST() {
  return ussdMenuResponse()
}
