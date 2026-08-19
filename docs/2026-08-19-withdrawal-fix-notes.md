# Withdrawal Initiation Fix

## Context
Organizers were unable to initiate withdrawals from their accounts. The withdrawal system was failing silently or returning errors.

## Root Cause
The withdrawal system uses a database RPC function `process_organizer_withdrawal` (from migration `20260526000000_enterprise_accounting_ledger.sql`) that requires an existing row in the `organizer_wallets` table. Some organizers did not have wallet rows created, causing the RPC to fail with "wallet not found" errors.

## Affected Files
- `lib/organizer-wallet.ts`

## Changes Made
Added a new helper function `ensureOrganizerWalletExists()` that:
1. Checks if a wallet row exists for the organizer
2. Creates one with default values if missing
3. Is called before attempting the RPC withdrawal

Modified `createOrganizerWithdrawalRequest()` to:
1. Call `ensureOrganizerWalletExists()` before RPC attempt
2. Treat "wallet not found" errors as fallback cases (not hard errors)
3. Improved error handling to distinguish between function missing vs wallet issues

## Rationale
The RPC function uses row-level locking on the `organizer_wallets` table to prevent overdrafts. Without a wallet row, the lock fails. By ensuring the row exists before the RPC call, we prevent this failure mode while maintaining the atomic guarantees of the RPC.

## Testing Steps
1. Test withdrawal from an organizer account with existing wallet row - should work as before
2. Test withdrawal from an organizer account without wallet row - should create wallet and proceed
3. Test insufficient balance scenarios - should still fail appropriately
4. Test both event-specific and orphaned funds withdrawals

## Rollback Instructions
If issues arise, revert the changes to `lib/organizer-wallet.ts`:
1. Remove the `ensureOrganizerWalletExists()` function
2. Remove the call to `ensureOrganizerWalletExists()` in `createOrganizerWithdrawalRequest()`
3. Remove the `isWalletNotFound` check in the error handling
4. Restore original error message in console.warn

## Additional Notes
- The fallback legacy path remains intact as a safety net
- Wallet rows are created with zero balances; actual balances are calculated from event earnings
- This fix is backward compatible with existing organizers who already have wallet rows
