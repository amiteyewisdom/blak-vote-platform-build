const FROM_EMAIL = process.env.OTP_FROM_EMAIL ?? 'BlakVote <noreply@mail.blakvote.com>'

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', to)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[email] Resend error', res.status, body)
  }
}

function baseTemplate(content: string): string {
  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">' +
    '<div style="max-width:520px;margin:0 auto;background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:40px">' +
    '<p style="color:#d4af37;font-size:20px;font-weight:700;margin:0 0 2px;letter-spacing:-0.5px">BlakVote</p>' +
    '<p style="color:#666;font-size:13px;margin:0 0 28px">Premium Digital Voting Platform</p>' +
    content +
    '<hr style="border:none;border-top:1px solid #2a2a2a;margin:28px 0">' +
    '<p style="color:#444;font-size:12px;margin:0;line-height:1.6">You received this email because you made a transaction on BlakVote. Keep this email as your receipt.</p>' +
    '</div></body></html>'
  )
}

export async function sendTicketConfirmationEmail(params: {
  to: string
  buyerName: string
  eventTitle: string
  ticketName: string | null
  ticketCodes: string[]
  reference: string
  amount: number
}): Promise<void> {
  const { to, buyerName, eventTitle, ticketName, ticketCodes, reference, amount } = params
  const firstName = buyerName.split(' ')[0] || buyerName
  const categoryLabel = ticketName ? ` — <strong style="color:#d4af37">${ticketName}</strong>` : ''
  const codesHtml = ticketCodes
    .map(
      (code) =>
        '<div style="background:#1a1a1a;border:1px solid #2e2c1a;border-radius:10px;padding:16px 20px;text-align:center;margin:8px 0">' +
        '<span style="font-size:22px;font-weight:700;letter-spacing:6px;color:#d4af37;font-family:monospace">' + code + '</span>' +
        '</div>'
    )
    .join('')

  const content =
    '<h2 style="color:#f5f5f5;font-size:22px;font-weight:600;margin:0 0 8px">🎟️ Ticket Confirmed</h2>' +
    '<p style="color:#a0a0a0;font-size:15px;margin:0 0 20px">Hi ' + firstName + ', your ticket purchase was successful.</p>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 20px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Event</p>' +
    '<p style="margin:0;color:#f5f5f5;font-weight:600">' + eventTitle + '</p>' +
    '</div>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 20px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Ticket Type</p>' +
    '<p style="margin:0;color:#f5f5f5">' + (ticketName || 'General Admission') + '</p>' +
    '</div>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 20px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Amount Paid</p>' +
    '<p style="margin:0;color:#d4af37;font-weight:700;font-size:18px">GHS ' + Number(amount).toFixed(2) + '</p>' +
    '</div>' +
    '<p style="color:#a0a0a0;font-size:14px;margin:0 0 12px">Your ticket code' + (ticketCodes.length > 1 ? 's' : '') + categoryLabel + ':</p>' +
    codesHtml +
    '<p style="color:#666;font-size:13px;margin:16px 0 0">Screenshot or save your code(s). Present them at the event entrance for scanning.</p>' +
    '<p style="color:#555;font-size:12px;margin:12px 0 0">Reference: <span style="font-family:monospace;color:#888">' + reference + '</span></p>'

  await sendEmail(to, 'Your BlakVote Ticket — ' + eventTitle, baseTemplate(content))
}

export async function sendVoteConfirmationEmail(params: {
  to: string
  voterName?: string
  eventTitle: string
  candidateName: string
  quantity: number
  amount: number
  reference: string
}): Promise<void> {
  const { to, voterName, eventTitle, candidateName, quantity, amount, reference } = params
  const greeting = voterName ? 'Hi ' + voterName.split(' ')[0] + ',' : 'Hello,'

  const content =
    '<h2 style="color:#f5f5f5;font-size:22px;font-weight:600;margin:0 0 8px">✅ Vote Confirmed</h2>' +
    '<p style="color:#a0a0a0;font-size:15px;margin:0 0 20px">' + greeting + ' your vote has been recorded successfully.</p>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 14px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Event</p>' +
    '<p style="margin:0;color:#f5f5f5;font-weight:600">' + eventTitle + '</p>' +
    '</div>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 14px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Voted For</p>' +
    '<p style="margin:0;color:#d4af37;font-weight:600">' + candidateName + '</p>' +
    '</div>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 14px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Votes Cast</p>' +
    '<p style="margin:0;color:#f5f5f5">' + quantity + ' vote' + (quantity > 1 ? 's' : '') + '</p>' +
    '</div>' +
    '<div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin:0 0 20px">' +
    '<p style="margin:0 0 6px;color:#888;font-size:13px">Amount Paid</p>' +
    '<p style="margin:0;color:#d4af37;font-weight:700;font-size:18px">GHS ' + Number(amount).toFixed(2) + '</p>' +
    '</div>' +
    '<p style="color:#555;font-size:12px;margin:0">Reference: <span style="font-family:monospace;color:#888">' + reference + '</span></p>'

  await sendEmail(to, 'Your BlakVote Vote Receipt — ' + eventTitle, baseTemplate(content))
}
