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
    - Switched to a single, safe **flex row** (`flex flex-row items-start gap-3`) on all screens.
    - Long nominee names wrap naturally (`break-words w-full min-w-0`) instead of using `line-clamp-2`, which was creating a huge min-content width and pushing the count off-screen on phones.
    - Vote text is right-aligned, vertically centered, and has a fixed minimum width (`shrink-0 min-w-[4.5rem]`) so it never gets squeezed out.
    - Card keeps `overflow-hidden` as a safety net.
  - Group header: `min-w-0 flex-1` with chevron/image set to `shrink-0`, title `truncate`.

- File: `app/events/[eventId]/page.tsx`
  - Category header: same min/max-width/truncate pattern so long titles don’t push counts or icons.
  - Candidate cards:
    - Same single **flex row** layout as the nominees page (`flex flex-row items-start gap-3`).
    - Avatar and name on the left (`flex items-start gap-4 flex-1 min-w-0`).
    - Name wraps naturally (`break-words w-full min-w-0`) with no mobile line-clamp, fixing the overflow caused by `line-clamp-2` min-content.
    - Vote-count box is `shrink-0 min-w-[4.5rem]` and `self-center`, so it stays fully visible on the right even on 320px screens.
    - Removed the selected-card `scale-[1.01]` transform to avoid clipping the count box on mobile.
  - Added `min-w-0` to the `lg:col-span-2` candidate list column so the outer grid can shrink on narrow viewports.

### Root cause of the mobile overflow
`line-clamp-2` on nominee names made the heading’s **min-content** equal to the full, un-clamped text width. Because the flex item had no explicit width/min-width, that intrinsic width pushed the right-side vote-count box off the screen. Setting `w-full min-w-0` and using plain `break-words` lets the name wrap to the available space instead of dictating a minimum width.

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
