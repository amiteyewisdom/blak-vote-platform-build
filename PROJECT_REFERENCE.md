# BlakVote Platform — Project Reference

> **PRODUCTION SYSTEM** — Real users, real money. Every change must be treated with production-level care.  
> Do NOT modify payment logic, auth, or DB migrations without thorough review and testing.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Directory Structure](#4-directory-structure)
5. [User Roles](#5-user-roles)
6. [Core Features](#6-core-features)
7. [Database Schema Overview](#7-database-schema-overview)
8. [Payment System](#8-payment-system)
9. [API Routes Reference](#9-api-routes-reference)
10. [Key Library Files](#10-key-library-files)
11. [Admin Panel](#11-admin-panel)
12. [Organizer Panel](#12-organizer-panel)
13. [Voter Flow](#13-voter-flow)
14. [Revenue & Wallet System](#14-revenue--wallet-system)
15. [Known Issues & Fixes Applied](#15-known-issues--fixes-applied)
16. [Deployment Notes](#16-deployment-notes)
17. [Environment Variables](#17-environment-variables)

---

## 1. Project Overview

BlakVote is a live, production-grade online voting platform built for Ghana-based events (awards, competitions, etc.). It supports:

- Paid voting via mobile money (MTN, Vodafone, AirtelTigo) and Paystack
- USSD voting via shortcode (Nalo Solutions integration)
- Organizer event management (nominees, categories, tickets, results)
- Admin oversight (platform earnings, organizer withdrawals, user management)
- Bulk vote packages
- QR code ticket scanning
- Manual vote recording with full audit trail

**Live URL:** `https://app.blakvote.com`

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | TailwindCSS + Radix UI + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (custom role system via `public.users` table) |
| Payment — Card/MoMo | Paystack |
| Payment — USSD | Nalo Solutions |
| Package Manager | pnpm |
| Testing | Vitest |
| Animations | Framer Motion |
| Icons | Lucide React |
| Forms | React Hook Form + Zod |
| Charts | Recharts |

---

## 3. Architecture

```
Browser / Mobile
      │
      ▼
Next.js App Router (app/)
  ├── Public pages (/, /events, /vote/[id])
  ├── Auth pages (/sign-in, /sign-up, /auth/*)
  ├── Voter pages (/voter/*, /my-votes)
  ├── Organizer pages (/organizer/*)
  └── Admin pages (/admin/*)
      │
      ▼
API Routes (app/api/*)
      │
      ▼
Supabase (PostgreSQL + Auth + Storage)
      │
      ├── Paystack API (card payments, bank transfers, MoMo payouts)
      └── Nalo Solutions API (USSD voting + SMS)
```

### Auth Flow
- Custom `public.users` table mirrors `auth.users`
- Roles: `admin`, `organizer`, `voter`
- `requireRole()` in `lib/api-auth.ts` guards all API routes
- `getAuthenticatedUser()` in `lib/auth/server-auth.ts` reads session server-side

---

## 4. Directory Structure

```
/
├── app/
│   ├── admin/                        # Admin dashboard pages
│   │   ├── page.tsx                  # Dashboard overview
│   │   ├── analytics/                # Platform analytics
│   │   ├── applications/             # Organizer applications
│   │   ├── audit/                    # System audit logs
│   │   ├── events/                   # Event management
│   │   ├── settings/                 # Platform settings
│   │   ├── users/                    # User management
│   │   └── withdrawals/              # Organizer + platform withdrawals
│   │
│   ├── organizer/                    # Organizer dashboard pages
│   │   ├── page.tsx                  # Organizer home
│   │   ├── create-event/             # New event wizard
│   │   ├── events/[eventId]/
│   │   │   ├── page.tsx              # Event overview
│   │   │   ├── categories/           # Category management
│   │   │   ├── nominees/             # Nominee management
│   │   │   ├── edit/                 # Edit event details
│   │   │   ├── results/              # Live results
│   │   │   ├── scan/                 # QR ticket scanner
│   │   │   ├── tickets/              # Ticket management
│   │   │   ├── votes/                # Votes & transactions page
│   │   │   └── withdraw/             # Request withdrawal
│   │   ├── wallet/                   # Organizer wallet
│   │   └── settings/                 # Organizer settings
│   │
│   ├── events/                       # Public event listing/detail
│   ├── vote/                         # Public voting pages
│   ├── voter/                        # Voter dashboard
│   ├── payment/                      # Payment callback handling
│   ├── auth/                         # Auth callbacks
│   └── api/                          # All API routes (see section 9)
│
├── lib/
│   ├── payment-processing.ts         # ⚠️ Core payment logic (DO NOT EDIT LIGHTLY)
│   ├── organizer-wallet.ts           # ⚠️ Wallet credit/debit logic
│   ├── nalo-payment.ts               # ⚠️ USSD/Nalo payment integration
│   ├── paystack-payouts.ts           # Paystack transfer/payout logic
│   ├── admin-revenue-sync.ts         # Sync payments → admin_revenue_transactions
│   ├── audit-logging.ts              # Vote audit log helpers
│   ├── api-auth.ts                   # requireRole() guard
│   ├── server-security.ts            # getSupabaseAdminClient()
│   ├── accounting-types.ts           # Shared financial types
│   ├── organizer-fees.ts             # Fee percentage helpers
│   ├── payment-route-security.ts     # Payment route validation
│   └── auth/                         # Server auth helpers
│
├── components/                       # Shared UI components
├── supabase/migrations/              # All DB migrations (47 files)
└── public/                           # Static assets
```

---

## 5. User Roles

| Role | Access |
|---|---|
| `admin` | Full platform access, all withdrawals, user management, platform settings |
| `organizer` | Own events only — create/manage events, nominees, tickets, view votes, request withdrawal |
| `voter` | Vote on events, view own voting history |

Role is stored in `public.users.role`. Enforced server-side via `requireRole()` on every API route.

---

## 6. Core Features

### Voting
- **Paid votes** via Paystack (card, mobile money)
- **USSD votes** via Nalo Solutions shortcode `*713*`
- **Manual votes** — admin/organizer records verified votes with audit trail
- **Bulk vote packages** — pre-purchased vote bundles
- Vote quantities tracked per nominee; `nominations.vote_count` updated via DB trigger

### Events
- Events have `status`: `draft` → `published` → `active` → `ended`
- Each event has categories → nominees (nominations table)
- Events have a `short_code` (3 chars) and `uuid` for identification
- Nominees have `uuid_ref`, `short_code`, `voting_code` for lookup

### Tickets
- Events can sell entry tickets via Paystack
- Ticket plans with inventory tracking
- QR code generation and scanning for entry

### Results
- Live results page showing nominee vote counts
- Organizer and public results views

---

## 7. Database Schema Overview

### Key Tables

| Table | Purpose |
|---|---|
| `public.users` | Custom user profiles (mirrors auth.users) |
| `events` | Event records |
| `nominations` | Nominees per event (has `vote_count`, `uuid_ref`, `short_code`) |
| `categories` | Event categories |
| `votes` | Individual vote records (`vote_type`: paid/manual/ussd) |
| `vote_audit_log` | Full audit trail for all votes |
| `payments` | Payment records (Paystack + Nalo) |
| `organizer_wallets` | Per-organizer wallet balance |
| `organizer_wallet_transactions` | Wallet credit/debit ledger |
| `organizer_withdrawals` | Organizer payout requests |
| `admin_revenue_transactions` | Platform fee earnings per payment |
| `admin_platform_withdrawals` | Admin platform payout requests |
| `bulk_vote_packages` | Bulk vote bundle definitions |
| `ticket_plans` | Ticket types per event |
| `ticket_purchases` | Ticket purchase records |
| `ussd_sessions` | USSD session state |
| `email_otps` | OTP codes for phone auth |
| `organizer_fee_overrides` | Per-organizer fee % overrides |

### Important Column Notes

**`admin_platform_withdrawals`** (production has the v1 schema):
- `requested_by_admin_id UUID NOT NULL` ← original column (production)
- `requested_by_user_id UUID` ← added later via ALTER TABLE
- `status`: `pending` | `processed` | `cancelled`
- **Always insert both columns** when creating records

**`nominations`**:
- `uuid_ref` — UUID for frontend/API lookup
- `short_code` — 3-char code for USSD
- `voting_code` — alternative lookup code
- `vote_count` — maintained by DB trigger

### Key DB Functions

| Function | Purpose |
|---|---|
| `get_admin_available_platform_balance()` | Returns available platform earnings minus pending/processed withdrawals |
| `get_admin_platform_withdrawal_history(limit, offset)` | Platform withdrawal history |
| `get_admin_revenue_summary()` | RPC for revenue summary |
| `process_vote(...)` | Atomic vote processing with count increment |
| `get_admin_platform_balance()` | Detailed balance breakdown |
| `issue_ticket_purchase(...)` | Atomic ticket purchase |

---

## 8. Payment System

> ⚠️ **Critical files — modify with extreme caution:**
> - `lib/payment-processing.ts` (80KB — core logic)
> - `lib/organizer-wallet.ts` (42KB — wallet credits)
> - `lib/nalo-payment.ts` (25KB — USSD)

### Payment Providers

**Paystack** (`lib/paystack-payouts.ts`)
- Card payments, mobile money payments
- Recipient creation + transfer for organizer payouts
- Webhook at `/api/paystack/webhook`

**Nalo Solutions** (`lib/nalo-payment.ts`)
- USSD shortcode `*713*` for voting
- SMS confirmations
- Webhook at `/api/nalo/callback`

### Payment Flow (Paid Vote)
1. Frontend calls `/api/payment-init` with `eventId`, `candidateId`, `quantity`
2. `verifyEventAndCandidate()` resolves nominee by UUID, uuid_ref, short_code, or voting_code
3. Paystack payment initialized → user redirected to Paystack
4. On success → Paystack webhook hits `/api/paystack/webhook`
5. `payment-processing.ts` verifies + processes payment
6. Vote recorded in `votes` table + `vote_audit_log`
7. `nominations.vote_count` incremented via trigger
8. Platform fee recorded in `admin_revenue_transactions`
9. Net amount credited to organizer wallet

### Fee Structure
- Platform takes a % fee per vote payment
- Default fee % configurable in `platform_settings` table
- Per-organizer overrides in `organizer_fee_overrides`
- `lib/organizer-fees.ts` resolves effective fee for any organizer

### Organizer Withdrawal Flow
1. Organizer requests withdrawal at `/organizer/events/[eventId]/withdraw`
2. Admin reviews at `/admin/withdrawals`
3. Admin clicks "Approve" → tries Paystack transfer immediately
4. If Paystack balance insufficient → status = `pending_funds`
5. Cron job at `/api/cron/retry-withdrawals` retries pending_funds
6. Admin can also manually "Mark Processed" for offline transfers

---

## 9. API Routes Reference

### Admin Routes (`/api/admin/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/withdrawals` | GET | List organizer withdrawal requests |
| `/api/admin/approve-withdrawal` | POST | Approve + attempt Paystack payout |
| `/api/admin/process-withdrawal` | POST | Mark withdrawal as manually processed |
| `/api/admin/retry-withdrawal` | POST | Retry failed Paystack payout |
| `/api/admin/reopen-withdrawal` | POST | Move processed withdrawal back to processing |
| `/api/admin/platform-withdrawals` | GET/POST | Platform earnings withdrawal management |
| `/api/admin/platform-withdrawals/process` | POST | Mark platform withdrawal processed |
| `/api/admin/users` | GET | List all users |
| `/api/admin/events` | GET | List all events |

### Organizer Routes (`/api/organizer/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/organizer/votes` | GET | Votes for an event (query param `?eventId=`) |
| `/api/organizer/event/[eventId]/votes` | GET | Votes for event (path param) |
| `/api/organizer/wallet` | GET | Wallet balance + transactions |
| `/api/organizer/withdraw` | POST | Request withdrawal |
| `/api/organizer/nominees` | GET | Event nominees |
| `/api/organizer/categories` | GET/POST | Event categories |

### Payment Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/payment-init` | POST | Initialize Paystack payment |
| `/api/paystack/webhook` | POST | Paystack payment webhook |
| `/api/nalo/callback` | POST | Nalo USSD payment callback |
| `/api/payments/verify/[reference]` | GET | Verify payment status |

### Vote Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/vote` | POST | Record a vote |
| `/api/votes/audit` | GET | Vote audit log |

### Auth Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/callback` | GET | OAuth/magic link callback |
| `/api/send-otp` | POST | Send OTP to phone |
| `/api/verify-otp` | POST | Verify OTP |

### Cron Routes

| Route | Purpose |
|---|---|
| `/api/cron/retry-withdrawals` | Retry pending_funds organizer withdrawals |
| `/api/cron/...` | Other scheduled tasks |

---

## 10. Key Library Files

### `lib/payment-processing.ts`
The heart of the payment system. Handles:
- Payment verification from Paystack/Nalo
- Vote processing after payment confirmation
- Wallet crediting
- Admin revenue recording
- Concurrency safety (duplicate payment prevention)

### `lib/organizer-wallet.ts`
- Credit/debit organizer wallet
- Transaction ledger management
- Balance queries

### `lib/admin-revenue-sync.ts`
- `syncMissingAdminRevenueTransactions()` — scans `payments` table and backfills any missing entries in `admin_revenue_transactions`
- Called on GET and POST of platform withdrawals API

### `lib/nalo-payment.ts`
- Full USSD session management
- Nalo API integration for vote payments
- SMS confirmation sending

### `lib/paystack-payouts.ts`
- `createPaystackRecipient()` — create transfer recipient
- `initiatePaystackTransfer()` — send payout
- `verifyPaystackTransfer()` — check transfer status

### `lib/audit-logging.ts`
- `logVoteAudit()` — records to `vote_audit_log`
- Used for both paid and manual votes

### `lib/server-security.ts`
- `getSupabaseAdminClient()` — returns Supabase admin client (bypasses RLS)
- Used in all server-side API routes that need elevated DB access

### `lib/api-auth.ts`
- `requireRole(supabase, ['admin'])` — returns `{ok, userId, role}` or redirect response
- `ensureEventOwnedByOrganizer()` — ownership check for organizer routes

---

## 11. Admin Panel

**Path:** `/admin/*`  
**Access:** `role === 'admin'` only

### Pages

| Page | Path | Purpose |
|---|---|---|
| Dashboard | `/admin` | Platform overview metrics |
| Events | `/admin/events` | All events across all organizers |
| Users | `/admin/users` | All registered users |
| Applications | `/admin/applications` | Organizer applications to review |
| Audit | `/admin/audit` | System-wide audit logs |
| Analytics | `/admin/analytics` | Revenue analytics |
| Settings | `/admin/settings` | Platform fee %, platform settings |
| Withdrawals | `/admin/withdrawals` | All withdrawal management |

### Withdrawals Page (`/admin/withdrawals`)

**Organizer Requests section:**
- Shows all organizer withdrawal requests
- Approve → triggers Paystack transfer immediately
- `pending_funds` status = Paystack balance was low, waiting for cron retry
- "Retry Paystack Payout" = manual retry
- "Mark Processed" = offline transfer confirmation
- "Reopen To Processing" = undo a processed status

**Platform Earnings Payouts section:**
- Shows total platform fees collected (from `admin_revenue_transactions`)
- Admin enters amount + method + optional JSON account details
- POST to `/api/admin/platform-withdrawals`
- Records in `admin_platform_withdrawals` table
- Admin manually marks as processed once funds are sent

---

## 12. Organizer Panel

**Path:** `/organizer/*`  
**Access:** `role === 'organizer'` only

### Event Management (`/organizer/events/[eventId]/`)

| Sub-page | Purpose |
|---|---|
| `page.tsx` | Event overview — stats, quick links |
| `categories/` | Add/edit vote categories |
| `nominees/` | Add/edit nominees per category |
| `edit/` | Edit event details, dates, images |
| `results/` | Live vote count results |
| `tickets/` | Ticket plan management |
| `scan/` | QR code scanner for ticket entry |
| `votes/` | Votes & Transactions page |
| `withdraw/` | Request earnings withdrawal |

### Votes & Transactions Page (`/organizer/events/[eventId]/votes/`)

- **Tab: Paid Votes** — shows paid vote records from `votes` table
- **Tab: Record (Manual Votes & Audit)** — shows `vote_audit_log`, allows adding manual votes
- **Filters:** date range, year, month, nominee, category
- **Export:** CSV download for paid votes and audit logs
- Revenue amount is **intentionally hidden** from organizers (only "Paid Transactions" count shown)
- Nominee lookup: matches `candidate_id` → `nominees.nominee_id`; falls back to "Unknown Nominee" if not found

---

## 13. Voter Flow

1. Voter visits `/events` or direct event URL
2. Selects nominee → quantity → payment method
3. **Paystack flow:** Redirected to Paystack → payment → callback → vote recorded
4. **USSD flow:** Dials `*713*` → follows menu → payment → vote recorded
5. Voter can view voting history at `/my-votes`

### Nominee ID Resolution
`verifyEventAndCandidate()` in payment-init tries:
1. Direct UUID match on `nominations.uuid_ref`
2. Match on `nominations.short_code`
3. Match on `nominations.voting_code`
4. Bigint ID match (legacy)

---

## 14. Revenue & Wallet System

### Flow of Money

```
Voter pays GHS X
       │
       ├─ Platform fee (%) → admin_revenue_transactions
       └─ Net amount → organizer_wallet_transactions (credit)
                              │
                              └─ organizer_wallets.balance updated
```

### Platform Revenue
- Stored in `admin_revenue_transactions` per payment
- `platform_fee_amount` column = admin's cut
- `gross_amount` = total voter payment
- Synced by `syncMissingAdminRevenueTransactions()` on each platform-withdrawals API call

### Admin Available Balance Formula
```
available = SUM(platform_fee_amount from admin_revenue_transactions)
           - SUM(amount_requested from admin_platform_withdrawals WHERE status IN ('pending', 'processed'))
```

### Organizer Wallet
- `organizer_wallets` table: one row per organizer, has `balance`
- All credits/debits recorded in `organizer_wallet_transactions`
- Withdrawal reduces balance; failed/cancelled withdrawal credits back

---

## 15. Known Issues & Fixes Applied

### `admin_platform_withdrawals` table schema mismatch
- **Problem:** Two migrations created conflicting schemas. Production ran the first migration (`20260413000000`) which uses `requested_by_admin_id`. The second migration (`20260413110000`) used `CREATE TABLE IF NOT EXISTS` and was skipped.
- **Fix applied:** 
  1. Ran `ALTER TABLE admin_platform_withdrawals ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES auth.users(id)`
  2. Code now inserts **both** `requested_by_admin_id` AND `requested_by_user_id`
- **API file:** `app/api/admin/platform-withdrawals/route.ts`

### Revenue hidden from organizers
- Organizer votes page no longer shows GHS amounts
- "Revenue (Paid Only)" metric removed
- "Total Votes" metric removed
- Only "Paid Transactions" count shown
- Amount column removed from paid votes table and CSV export

### UUID shown as nominee name
- Fixed: when `candidate_id` doesn't match any nominee in the list, displays "Unknown Nominee" instead of raw UUID
- Affects both Paid Votes table and Audit Logs table in the organizer votes page

### `syncMissingAdminRevenueTransactions` not wrapped in try/catch (POST)
- Fixed: sync errors are now caught and logged as warnings, allowing the withdrawal request to proceed

### Temporal Dead Zone (TDZ) error on votes page
- Fixed: `filteredPaidVotes` now derived directly from `votes` array instead of intermediate `paidVotes` variable

---

## 16. Deployment Notes

- Hosted on **Netlify** (Next.js SSR)
- DB on **Supabase** (hosted PostgreSQL)
- Environment variables set in Netlify dashboard

### DB Migrations
Migrations are in `supabase/migrations/` but are **NOT auto-applied** to production.  
You must run migration SQL manually in **Supabase Dashboard → SQL Editor**.

After running DDL changes, always reload the PostgREST schema cache:
```sql
NOTIFY pgrst, 'reload schema';
```

After adding new tables, grant service_role access:
```sql
GRANT ALL ON <table_name> TO service_role;
```

### Cron Jobs
Retry cron at `/api/cron/retry-withdrawals` should be set up in Netlify scheduled functions or an external cron service.

---

## 17. Environment Variables

These must be set in Netlify (and `.env.local` for dev):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `PAYSTACK_SECRET_KEY` | Paystack secret API key |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `NALO_API_KEY` | Nalo Solutions API key |
| `NALO_SHORTCODE` | USSD shortcode (e.g. `713`) |
| `NEXT_PUBLIC_APP_URL` | Full app URL (e.g. `https://app.blakvote.com`) |

---

*Last updated: July 2026*
