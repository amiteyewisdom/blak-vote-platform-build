create table if not exists public.ussd_sessions (
  session_id text primary key,
  phone_number text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_ussd_sessions_updated_at
  on public.ussd_sessions (updated_at desc);
