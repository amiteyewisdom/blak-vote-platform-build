# Nalo USSD Integration Guide

This project already includes an offline USSD endpoint at:

- POST/GET /api/ussd

Use this guide to connect Nalo Solutions to your USSD flow for both voting and ticketing, including paid Mobile Money confirmation.

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
2. Enter nominee (candidate) code
3. Enter quantity
4. Confirm or cancel

Input sequence example (what the backend parses):

- 1*ABC*5*1

Meaning:

- 1 = Vote
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

## 5) Payment Callback (Required for Paid USSD)

Paid flows use a second callback endpoint for payment status updates:

- POST /api/nalo/webhook

Set your Nalo MoMo callback URL to:

- https://YOUR_DOMAIN/api/nalo/webhook

Expected behavior:

- `success/successful/paid/completed/processed` => backend verifies and creates vote or ticket
- `pending/processing/queued/initiated` => backend keeps payment pending
- `failed/cancelled/expired/rejected` => backend marks payment failed

Nalo callback payload can be JSON or form data. The backend accepts reference and status from root fields, nested `data`, and `extra_data`.

## 6) Security (Optional but Recommended)

Set this env var if you want signed callbacks:

- USSD_WEBHOOK_SECRET=your_shared_secret

Then configure Nalo to send one of these headers:

- x-ussd-signature
- x-signature

Signature algorithm expected:

- HMAC-SHA256 of the raw request body, hex encoded

If USSD_WEBHOOK_SECRET is not set, signature checks are skipped.

For Nalo payment webhooks, you can enable signed callbacks with:

- NALO_WEBHOOK_SECRET=your_shared_secret

Supported signature headers for payment webhook:

- x-nalo-signature
- x-signature
- x-webhook-signature

Signature format supported:

- plain hex digest
- `sha256=<hex digest>`

If NALO_WEBHOOK_SECRET is not set, Nalo payment webhook signature checks are skipped.

## 7) Quick Test Before Going Live

Send a test callback to your endpoint with sample values and verify you receive CON/END responses.

Example body values:

- sessionId: test-session-001
- phoneNumber: 233501234567
- text: 1*ABC*1*1

Expected vote result:

- END Vote recorded successfully. Thank you for voting!

Example ticket test:

- sessionId: test-session-002
- phoneNumber: 233501234567
- text: 2*337*1*1*Kwame Mensah*1

Expected ticket result:

- END Ticket issued. Code: XXXXXXXX

After confirming the MoMo prompt on your phone for a paid flow, expect the Nalo webhook to complete the payment and issue the vote/ticket.

## 8) Notes

- Voting only works when event status is active.
- Candidate code must resolve to a single active event.
- Ticketing works from the same USSD endpoint.
- The user selects a ticket plan by menu number, not by ticket UUID.
- Free voting can complete on USSD only when the vote price resolves to 0.
- Free tickets can be issued directly on USSD.
- Paid voting on USSD is enabled through Nalo MoMo collection plus webhook confirmation.
- Paid ticketing on USSD is enabled through Nalo MoMo collection plus webhook confirmation.
- Duplicate callback retries are handled via deterministic transaction IDs per session/action.

## 8.1) Optional SMS Delivery for Paid USSD Tickets

After paid USSD ticket payment is confirmed on `POST /api/nalo/webhook`, the backend can send issued ticket code(s) by SMS via Nalo SMS API.

Configure authentication with either:

- `NALO_SMS_AUTH_KEY=your_auth_key`

or:

- `NALO_SMS_USERNAME=your_username`
- `NALO_SMS_PASSWORD=your_password`

Configure routing/sender:

- `NALO_SMS_USERNAME_PREFIX=Resl_Nalo` (default)
- `NALO_SMS_API_URL=https://sms.nalosolutions.com/smsbackend/clientapi/Resl_Nalo/send-message/` (optional override)
- `NALO_SMS_SOURCE=BLAKVOTE` (sender ID)
- `NALO_SMS_DLR=1` (default)
- `NALO_SMS_TYPE=0` (default text SMS)
- `NALO_SMS_CALLBACK_URL=https://YOUR_DOMAIN/api/sms/dlr` (optional)

Implementation sends a GET request using Nalo parameters:

- `destination` (buyer phone)
- `message` (ticket code text)
- `source`, `type`, `dlr`
- auth via `key` or `username/password`

If auth variables are not set, ticket issuance still works and SMS send is skipped.

## 9) Where Money Goes

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
