# Mobile nominees layout hardening + Provider fee model backfill guard (2026-08-06)

## Executive summary
- Fixed mobile rendering so long nominee and category names never push vote counts off-screen.
- Corrected the accounting backfill so organizers with a deliberate 0% platform-fee override are not charged payment-provider fees historically.

## Background
- Accounting: Recent migrations moved the platform to track `provider_fee_amount` separately from `platform_fee_amount`. During historical backfill, organizers with a `0%` override risked being “re-inflated” by 1.95% (Paystack) / 2.00% (Nalo) because the backfill added provider fees back into stored `platform_fee_percent`.
- UI: On phones with narrow widths (320–390px), very long nominee names in the EXECUTIVE CEOs & PERSONALITIES AWARDS scheme made vote counts overflow or disappear.

## Changes

### Database / Accounting
- File: `supabase/migrations/20260806000004_fix_provider_fee_model.sql`
  - Added a `zero_overrides` CTE and conditional guards so that for organizers with `platform_fee_percent = 0` in `organizer_fee_overrides`:
    - `provider_fee_amount = 0`
    - `platform_fee_percent = 0`
    - `platform_fee_amount = 0`
  - Recomputed organizer net for gross rows:
    - `organizer_net_amount = GREATEST(gross_amount - platform_fee_amount, 0)`

Context: This preserves the intended “platform bears the provider fee” model while honoring explicit 0% overrides in historical data.

### Application UI
- File: `app/events/[eventId]/nominees/page.tsx`
  - Candidate rows:
    - Use `flex flex-col sm:flex-row` so the right-side vote box drops below on small screens instead of overflowing.
    - Left text column is `flex-1 min-w-0` to allow truncation/wrap.
    - Name uses `break-words` + `line-clamp-2` to prevent long names from taking the whole row.
    - Vote box gets `whitespace-nowrap shrink-0 min-w-[64px]` and right-align on mobile (`self-end` / `text-right`) to keep it visible.
  - Group header: `min-w-0 flex-1` with chevron/image set to `shrink-0`, title `truncate`.

- File: `app/events/[eventId]/page.tsx`
  - Category header: same min/max-width/truncate pattern so long titles don’t push counts or icons.
  - Candidate cards: stack on mobile; name wraps to two lines (`line-clamp-2`, `break-words`), vote box aligned to the right on mobile and non-shrinking.
  - Added `overflow-hidden` on the card to avoid layout spill.

Notes on Tailwind utilities used:
- `min-w-0`: required in flex containers for truncation/line-clamp to work.
- `shrink-0`: prevents icons/counters from compressing to 0.
- `overflow-hidden`: clips long content inside cards.
- `line-clamp-2`: tailwind plugin; ensure it's enabled in the project (already used elsewhere).

## Affected files
- `supabase/migrations/20260806000004_fix_provider_fee_model.sql`
- `app/events/[eventId]/page.tsx`
- `app/events/[eventId]/nominees/page.tsx`

## Verification

### UI checks
1. Clear cache or open in a private tab (to avoid stale CSS).
2. Test these routes:
   - `/events/[eventId]` (main event page)
   - `/events/[eventId]/nominees` (nominees list)
   - Note: `/vote/[event_code]` intentionally does not show vote counts by design.
3. Devices/widths to test:
   - 320px (iPhone SE), 360px (older Android), 390–414px (modern iPhones), landscape orientations.
4. Expected:
   - Long names truncate/wrap to max two lines.
   - Vote count boxes remain visible and aligned; icons never collapse.

### Data checks (0% override)
Run these queries in Supabase SQL editor:

```sql
-- 1) Find 0% overrides
SELECT organizer_user_id
FROM organizer_fee_overrides
WHERE platform_fee_percent = 0;

-- 2) Verify impacted ledger rows
SELECT id,
       organizer_id,
       gross_amount,
       platform_fee_percent,
       platform_fee_amount,
       provider_fee_amount,
       organizer_net_amount
FROM admin_revenue_transactions
WHERE organizer_id IN (
  SELECT organizer_user_id FROM organizer_fee_overrides WHERE platform_fee_percent = 0
)
  AND gross_amount > 0
ORDER BY created_at DESC
LIMIT 50;
```

Expected for those organizers: `platform_fee_percent = 0`, `platform_fee_amount = 0`, `provider_fee_amount = 0`, and `organizer_net_amount = gross_amount`.

If totals appear inconsistent, refresh derived tables via the reconciliation API (or call the functions directly):
- `POST /app/api/admin/reconcile-accounting` → runs `recalculate_revenue_state()`, `sync_organizer_wallet_from_ledger`, and `sync_admin_platform_wallet_from_ledger`.

## Rollback guidance
- UI: revert the specific class changes in the two TSX files.
- Accounting backfill: if needed, revert this migration and re-run reconciliation, or write a compensating update that restores the pre-change fee values (do this only in a controlled environment first).

## Known caveats
- IDE may show TypeScript module-type errors if `node_modules` or framework types are missing locally; these do not affect the deployed UI.
- Ensure Tailwind `line-clamp` plugin is enabled; otherwise text may wrap but not clamp to exactly two lines.

## Changelog entry
- 2026-08-06: Backfill guard for 0% platform-fee overrides; mobile nominee and event cards hardened for long names; vote counts remain visible across phone sizes.
