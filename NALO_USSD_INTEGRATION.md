# Nalo USSD Integration Guide

This project already includes an offline USSD endpoint at:

- POST/GET /api/ussd

Use this guide to connect Nalo Solutions to your USSD flow for both voting and ticketing.

## 1) Nalo Dashboard Configuration

Set your callback URL to:

- https://YOUR_DOMAIN/api/ussd

Recommended callback settings:

- Method: POST
- Content-Type: application/x-www-form-urlencoded (JSON also works)
- Expect plain text response from server
- Keep session on the Nalo side until server responds with END

## 2) Supported Request Fields

The endpoint accepts common field names and aliases. Nalo can send any of these:

- Session ID:
  - sessionId
  - session_id
  - sessionid
  - userId
  - clientSessionId
- Phone number:
  - phoneNumber
  - phone
  - msisdn
  - mobileNumber
- User input text:
  - text
  - input
  - msg
  - message
  - ussdString

## 3) USSD Flow Expected by Backend

The top-level menu is:

1. Welcome
2. Choose Vote or Ticketing

### Voting Flow

1. Choose `1`
2. Enter event code
3. Enter candidate code
4. Enter quantity
5. Confirm or cancel

Input sequence example (what the backend parses):

- 1*337*ABC*5*1

Meaning:

- 1 = Vote
- 337 = event code
- ABC = candidate code
- 5 = quantity
- 1 = confirm

### Ticketing Flow

1. Choose `2`
2. Enter event code
3. Select ticket option number from menu
4. Enter quantity
5. Enter buyer name
6. Confirm or cancel

Input sequence example:

- 2*337*1*2*Kwame Mensah*1

Meaning:

- 2 = Ticketing
- 337 = event code
- 1 = first ticket plan in menu
- 2 = quantity
- Kwame Mensah = buyer name
- 1 = confirm

## 4) Response Contract (Important)

The endpoint responds in standard USSD text format:

- CON your message...
- END your message...

Your aggregator must pass these responses through directly to the USSD session.

## 5) Security (Optional but Recommended)

Set this env var if you want signed callbacks:

- USSD_WEBHOOK_SECRET=your_shared_secret

Then configure Nalo to send one of these headers:

- x-ussd-signature
- x-signature

Signature algorithm expected:

- HMAC-SHA256 of the raw request body, hex encoded

If USSD_WEBHOOK_SECRET is not set, signature checks are skipped.

## 6) Quick Test Before Going Live

Send a test callback to your endpoint with sample values and verify you receive CON/END responses.

Example body values:

- sessionId: test-session-001
- phoneNumber: 233501234567
- text: 1*337*ABC*1*1

Expected vote result:

- END Vote recorded successfully. Thank you for voting!

Example ticket test:

- sessionId: test-session-002
- phoneNumber: 233501234567
- text: 2*337*1*1*Kwame Mensah*1

Expected ticket result:

- END Ticket issued. Code: XXXXXXXX

## 7) Notes

- Voting only works when event status is active.
- Candidate code must belong to the selected event.
- Ticketing works from the same USSD endpoint.
- The user selects a ticket plan by menu number, not by ticket UUID.
- Free voting can complete on USSD only when the vote price resolves to 0.
- Free tickets can be issued directly on USSD.
- Paid voting is not enabled on USSD yet in the current backend.
- Paid tickets are not enabled on USSD yet in the current backend. They still require a separate verified payment integration.
- Duplicate callback retries are handled via deterministic transaction IDs per session/action.

## 8) Where Money Goes

The USSD endpoint only handles menu navigation and backend actions after a confirmed payment event. It does not decide where collected money settles.

Settlement destination is controlled by the merchant account configured with Nalo for Mobile Money collection.

This means:

- If Nalo is configured to collect into your main merchant account, funds settle there.
- If you want USSD money to end up in PayPal, that must be supported and configured on the Nalo side as the settlement destination.
- If Nalo does not support direct settlement into PayPal, then the correct architecture is:
  - Nalo collects the MoMo payment
  - Nalo sends payment success callback/webhook to this backend
  - backend marks the payment as paid and creates the vote or ticket
  - money is later moved out through your own withdrawal or payout process

Important repo note:

- The current codebase only has a live online gateway integration for Paystack, not PayPal.
- So making USSD money go to PayPal is not something the current backend can enforce by itself.
- It depends on either Nalo settlement configuration or adding a separate PayPal payout/settlement integration.
