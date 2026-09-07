# Nalo Webhook 403 Error Fix

## Context
Nalo Solutions reported that their payment callback to `https://blakvote.com/api/nalo/webhook` was returning 403 Forbidden status, preventing payment confirmations from being processed.

## Root Cause
The webhook endpoint had IP whitelisting enabled with an outdated default allowed IP of `135.181.194.193`. Nalo's actual server IP (`46.62.146.177`) was not in this whitelist, causing all their callbacks to be blocked with 403 errors.

## Error Details
```
2026-09-07 14:03:26,642 - syslog - WARNING - MERCHANT CALLBACK HTTP ERROR: 
url:https://blakvote.com/api/nalo/webhook 
status_code:403 
data:{'order_id': '3QmBbsCeoRyobzt2DPhaXT', 'status': 'COMPLETED', ...}
(attempt 3/3)
```

## Affected Files
- `lib/nalo-payment.ts`

## Changes Made
Updated the default allowed IP for Nalo webhooks to their official server IP:

**Before:**
```typescript
const NALO_DEFAULT_WEBHOOK_ALLOWED_IPS = ['135.181.194.193']
```

**After:**
```typescript
const NALO_DEFAULT_WEBHOOK_ALLOWED_IPS = ['46.62.146.177']
```

## Rationale
- The old IP whitelist was blocking legitimate payment callbacks from Nalo
- Updated to Nalo's official server IP as provided by Nalo Solutions
- IP whitelisting provides first layer of security
- Signature verification (HMAC-SHA256) can still be enabled via `NALO_WEBHOOK_SECRET` for additional security
- IP filtering can be overridden via `NALO_WEBHOOK_ALLOWED_IPS` environment variable if needed

## Security Considerations
- IP whitelisting restricts webhook callbacks to Nalo's official server only
- Signature verification can be added as a second layer by setting `NALO_WEBHOOK_SECRET`
- If Nalo adds more servers, their IPs should be added to the whitelist or configured via environment variable

## Testing Steps
1. Verify Nalo callbacks now succeed (200/202 status)
2. Check payment confirmations are processed correctly
3. Monitor logs for any webhook activity from the whitelisted IP
4. If Nalo adds more servers, update the whitelist accordingly

## Rollback Instructions
If the old IP needs to be restored, revert the change in `lib/nalo-payment.ts`:
```typescript
const NALO_DEFAULT_WEBHOOK_ALLOWED_IPS = ['135.181.194.193']
```

Or configure via environment variable:
```
NALO_WEBHOOK_ALLOWED_IPS=46.62.146.177,additional_ip_here
```

## Additional Notes
- Nalo's official server IP: `46.62.146.177`
- Consider enabling `NALO_WEBHOOK_SECRET` for additional signature-based security
- Monitor webhook logs to ensure only legitimate callbacks from the whitelisted IP are processed
