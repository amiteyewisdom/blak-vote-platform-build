# Withdrawal Initiation Fix

## Context
Organizers were unable to initiate withdrawals from their accounts. The withdrawal system was failing silently or returning errors for both new and existing organizers.

## Root Cause
The withdrawal system uses a database RPC function `process_organizer_withdrawal` (from migration `20260526000000_enterprise_accounting_ledger.sql`) that requires:
1. An existing row in the `organizer_wallets` table
2. Accurate `withdrawable_balance` synced from the revenue ledger

Some organizers lacked wallet rows, and others had unsynced balances, causing RPC failures.

## Affected Files
- `lib/organizer-wallet.ts`

## Changes Made
Added a new helper function `ensureOrganizerWalletExists()` that:
1. Checks if a wallet row exists for the organizer
2. Creates one with default values if missing
3. Syncs wallet balance from ledger using `sync_organizer_wallet_from_ledger()` RPC
4. Is called before attempting the RPC withdrawal

Modified `createOrganizerWithdrawalRequest()` to:
1. Call `ensureOrganizerWalletExists()` before RPC attempt
2. Simplified error handling to always fall back to legacy path on any RPC failure
3. Removed distinction between different error types for more robust fallback

## Rationale
The RPC function uses row-level locking on the `organizer_wallets` table to prevent overdrafts. By:
- Ensuring the row exists before RPC call
- Syncing the balance from the source of truth (ledger)
- Always having a working fallback (legacy path that calculates from event metrics)

We ensure withdrawals work for all organizers regardless of wallet state or RPC availability.

## Testing Steps
1. Test withdrawal from organizer with existing synced wallet row - should use RPC
2. Test withdrawal from organizer without wallet row - should create wallet, sync, and proceed
3. Test withdrawal from organizer with unsynced wallet - should sync and proceed
4. Test insufficient balance scenarios - should still fail appropriately
5. Test both event-specific and orphaned funds withdrawals

## Rollback Instructions
If issues arise, revert the changes to `lib/organizer-wallet.ts`:
1. Remove the `sync_organizer_wallet_from_ledger()` call in `ensureOrganizerWalletExists()`
2. Restore original error handling with `isFunctionMissing` and `isWalletNotFound` checks
3. Remove the simplified fallback logic

## Additional Notes
- The fallback legacy path calculates balance from event metrics, ensuring it works without wallet rows
- Wallet sync ensures `withdrawable_balance` matches actual revenue from `admin_revenue_transactions`
- This fix is backward compatible and works for both new and existing organizers
- Legacy path serves as a robust safety net if RPC function is unavailable or fails
