# Payment Safeguards Documentation

## Overview

The vote platform includes six layers of payment safeguards to prevent fraud, abuse, and stale payments from being counted as votes.

---

## 1. Duplicate Payment Prevention

**Layer:** Database trigger + Application check

**What it does:**
Prevents a voter from having multiple unprocessed payments (pending or success status) for the same candidate in the same event within a 24-hour window.

**Where:**
- Database: `trg_prevent_duplicate_payment_for_candidate()` trigger (BEFORE INSERT/UPDATE)
- Application: Called during payment initialization

**Behavior:**
- On duplicate detection → `EXCEPTION: Duplicate payment detected`
- Returns **409 Conflict** to frontend
- Voter must wait for first payment to complete before initiating another

**Example:**
```
Voter attempts:
1. Pay for Candidate A in Event X (pending) ✓
2. Pay for Candidate A in Event X again (pending) ✗ BLOCKED
   Error: "Duplicate payment: voter already has pending or recent payment for this candidate"
```

---

## 2. Stale Payment Auto-Cleanup

**Layer:** Application scheduler (should run every 10 minutes)

**What it does:**
Automatically marks payments stuck in "pending" status for >30 minutes as `failed` and `stale_timeout`.

**Why:**
- Customer abandons payment (navigates away, closes browser)
- Paystack webhook never fires (rare, but possible)
- Payment expires in Paystack system (30-minute default)

**How to trigger:**
```bash
# Manual (admin-only):
curl -X POST http://localhost:3000/api/admin/payments/cleanup \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "stale"}'

# Response:
{
  "success": true,
  "staleMarked": 3,
  "before": { "pending": 10, ... },
  "after": { "pending": 7, ... }
}
```

**Database:**
- Function: `mark_stale_payments_as_failed()`
- Sets: `status = 'failed'`, `gateway_status = 'stale_timeout'`
- Only affects payments with `vote_id IS NULL` (no vote yet)

---

## 3. Pending Payment Rate Limiting

**Layer:** Application check (during initialization)

**What it does:**
Limits any voter to maximum **5 pending payments at any time** within a 1-hour window.

**Why:**
- Prevents spam payment attempts
- Detects automated abuse or accidental rapid clicks
- Each pending payment locks a candidate

**Example:**
```
Voter initiates:
1. Payment for Candidate A → pending ✓
2. Payment for Candidate B → pending ✓
3. Payment for Candidate C → pending ✓
4. Payment for Candidate D → pending ✓
5. Payment for Candidate E → pending ✓
6. Payment for Candidate F → pending ✗ BLOCKED

Error (429 Too Many Requests):
"Too many pending payments. Please wait for previous payments to complete."
```

**Database:**
- Query: `check_voter_pending_payment_limit(phone, max_pending=5)`
- Checks payments with `status = 'pending'` and `created_at > now() - 1 hour`

---

## 4. Daily Fraud Pattern Detection

**Layer:** Application check (during initialization)

**What it does:**
Limits any voter to maximum **10 payment attempts per day** (pending + failed + success combined).

**Why:**
- Detects coordinated fraud attempts (botnets, compromised accounts)
- Flags unusual voting behavior
- Prevents denial-of-service attacks on payment system

**Example:**
```
Voter attempts on the same day:
1. Payment attempt #1 (failed: invalid card)
2. Payment attempt #2 (failed: card declined)
3. Payment attempt #3 (pending)
4. Payment attempt #4 (success)
5-10. More attempts...
11. Attempt #11 → ✗ BLOCKED

Error (429 Too Many Requests):
"Too many payment attempts today. Please try again tomorrow or contact support."

Side effect:
- Entry logged in payment_failed_attempts table
- Flagged for manual review
```

**Database:**
- Query: `check_fraud_pattern_daily_limit(phone, max_daily_attempts=10)`
- Checks all statuses within 24 hours
- Failed attempts logged to `payment_failed_attempts` table for analytics

---

## 5. Failed Payment Attempt Tracking

**Layer:** Database trigger + Analytics table

**What it does:**
Records every failed payment attempt in a separate `payment_failed_attempts` table for fraud analytics.

**Captured:**
- `voter_phone` — who failed
- `event_id` — which event
- `reason` — why ("Payment failed", "Daily limit exceeded", etc.)
- `gateway_status` — Paystack status or internal code
- `failed_at` — when it failed (auto-indexed)

**Use cases:**
- Identify patterns of payment fraud
- Contact voters with persistent failures
- Adjust daily limits if needed
- Generate fraud reports

**Example query (find voters with 5+ failures today):**
```sql
SELECT voter_phone, COUNT(*) as failures
FROM payment_failed_attempts
WHERE failed_at > now() - interval '24 hours'
GROUP BY voter_phone
HAVING COUNT(*) >= 5
ORDER BY failures DESC;
```

---

## 6. Ghost Payment Detection & Cleanup

**Layer:** Application scheduler (should run daily)

**What it does:**
Archives and deletes orphaned payments that may have succeeded at Paystack but failed to create a vote record (and no webhook was received).

**Why:**
- Database/network race condition (rare)
- Webhook endpoint downtime
- RPC failure after Paystack verified payment
- These should never appear in vote tally

**Cleanup rules:**
```
1. Archive (status = 'abandoned'):
   - Payments with status IN ('success', 'pending')
   - No linked vote (vote_id IS NULL)
   - Updated >60 minutes ago
   
2. Hard-delete:
   - Failed payments older than 90 days
   - Frees storage, immaterial to audit
```

**Example:**
```
Before:
- 150 pending payments (no votes yet, >60 mins old)
- 10 success payments (no votes, >60 mins old)
- 200 failed payments (>90 days old)

After cleanup:
- 0 archived pending → vote_id stays NULL, status = 'abandoned'
- 10 archived success → vote tally unchanged
- 200 deleted failed → freed up
```

**How to trigger:**
```bash
curl -X POST http://localhost:3000/api/admin/payments/cleanup \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "ghost"}'

# Response:
{
  "ghostArchived": 10,
  "ghostDeleted": 200,
  "before": { "pending": 160, ... },
  "after": { "pending": 0, ... }
}
```

---

## Payment State Machine

```
                    ┌─────────────────────┐
                    │   Payment Created   │
                    │   (status: pending) │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────▼─────┐        ┌──────▼──────┐
              │  Stale >  │        │  Paystack   │
              │  30 mins? │        │  Processes  │
              └─────┬─────┘        └──────┬──────┘
                    │ YES               │
            ┌───────▼──────┐    ┌────────▼────────┐
            │   Failed     │    │ Payment Success │
            │  (timeout)   │    │  (gateway OK)   │
            └──────────────┘    └────────┬────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Webhook/Callback    │
                              │ Triggered           │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Verify with Paystack│
                              │ & Process Vote      │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │  Vote Created?      │
                              └──────┬──────────────┘
                                     │
                         ┌───────────┴───────────┐
                         │ YES              NO  │
                    ┌────▼────┐        ┌────▼──────┐
                    │Processed│        │  Abandoned │
                    │(linked) │        │ (Ghost)   │
                    └─────────┘        └────────────┘
```

---

## Admin Monitoring

### Manual Cleanup Endpoint

```typescript
// POST /api/admin/payments/cleanup
// Requires: admin role

Request body:
{
  "action": "full" | "stale" | "ghost"  // Default: "full"
}

Response:
{
  "success": true,
  "timestamp": "2026-04-07T12:00:00Z",
  "before": {
    "pending": 10,
    "stale": 3,
    "processed": 500,
    "failed": 25
  },
  "staleMarked": 3,
  "ghostArchived": 2,
  "ghostDeleted": 15,
  "after": {
    "pending": 7,
    "stale": 0,
    "processed": 500,
    "failed": 10
  }
}
```

### View Payment Stats

```typescript
// GET /api/admin/payments/cleanup
// Requires: admin role

Response:
{
  "timestamp": "2026-04-07T12:00:00Z",
  "stats": {
    "pending": 7,
    "stale": 0,
    "processed": 500,
    "failed": 10
  }
}
```

---

## Deployment Checklist

- [ ] Apply migration: `20260407002000_link_payments_to_votes.sql`
- [ ] Deploy updated `lib/payment-processing.ts` with safeguard checks
- [ ] Deploy new admin endpoint: `app/api/admin/payments/cleanup/route.ts`
- [ ] Set up cron job to run `POST /api/admin/payments/cleanup` every 10 minutes (stale cleanup)
- [ ] Set up daily cron to run `POST /api/admin/payments/cleanup?action=ghost` (ghost cleanup)
- [ ] Test duplicate payment detection: User attempts to pay twice quickly
- [ ] Test daily limit: User attempts 11 payments in 1 day
- [ ] Test stale cleanup: Create pending payment, wait 31 mins, verify it's marked failed
- [ ] Add monitoring dashboard to admin panel to display payment stats

---

## Threshold Tuning

Current safeguard thresholds are conservative to be production-safe. Adjust if needed:

| Safeguard | Current | Location | Tuning Guide |
|-----------|---------|----------|--------------|
| Stale timeout | 30 min | `mark_stale_payments_as_failed()` | Increase if Paystack webhooks are slow |
| Pending limit | 5 | `initializeVotePayment()` | Increase if voters complain about blocking |
| Daily attempts | 10 | `initializeVotePayment()` | Lower for high-fraud events |
| Ghost cleanup age | 60 min | `cleanupGhostPayments()` | Lower to clean faster; check for race conditions first |
| Failed payment retention | 90 days | `cleanup_ghost_payments()` | Lower if auditing needs shorter window |

---

## Debugging Payment Issues

### Payment stuck in "pending" state

```sql
-- Find oldest pending payments
SELECT id, reference, voter_phone, amount, created_at
FROM payments
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 10;

-- If >30 mins old, manually trigger cleanup or investigate webhook logs
```

### Payment has no linked vote

```sql
-- Find ghost payments (success but no vote)
SELECT id, reference, voter_phone, amount, processed_at
FROM payments
WHERE status IN ('success', 'processed')
  AND vote_id IS NULL
  AND updated_at > now() - interval '24 hours'
LIMIT 10;

-- Check if vote was created but not linked
SELECT id, transaction_id, created_at
FROM votes
WHERE transaction_id = 'PAY-<reference>';
```

### Voter blocked from paying

```sql
-- Check pending payments (duplicate prevention)
SELECT id, reference, status, created_at
FROM payments
WHERE voter_phone = '<phone>'
  AND status = 'pending'
  AND created_at > now() - interval '1 hour';

-- Check daily attempts (fraud pattern block)
SELECT DATE(created_at), status, COUNT(*)
FROM payments
WHERE voter_phone = '<phone>'
  AND created_at > now() - interval '24 hours'
GROUP BY DATE(created_at), status;

-- Check failed attempts log
SELECT reason, gateway_status, COUNT(*), MAX(failed_at)
FROM payment_failed_attempts
WHERE voter_phone = '<phone>'
  AND failed_at > now() - interval '24 hours'
GROUP BY reason, gateway_status;
```

---

## Security Notes

1. **No voter PII in logs** — Phone numbers stored in payments table only; hashed/anonymized before external logging.
2. **No payment amount tampering** — Amount verified against event vote_price and quantity.
3. **Idempotent verification** — Webhook and callback can both run; idempotency prevents double-voting.
4. **Rate-limit headers** — 429 responses include `Retry-After` header for client backoff.
5. **Audit trail** — All payment state changes captured via triggers; visible in audit_log table.

