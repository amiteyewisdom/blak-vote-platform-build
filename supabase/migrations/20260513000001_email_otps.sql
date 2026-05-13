-- Custom OTP table used for pre-signup email verification and password reset.
-- All read/write is performed exclusively via the service-role key in API routes.
-- RLS is enabled with no permissive policies, blocking any client-side access.

create table if not exists email_otps (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null,
  otp        text        not null,
  type       text        not null check (type in ('signup', 'reset')),
  verified   boolean     not null default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists email_otps_lookup_idx
  on email_otps (email, type, verified, expires_at);

alter table email_otps enable row level security;
-- No permissive policies: only the service-role key bypasses RLS.
