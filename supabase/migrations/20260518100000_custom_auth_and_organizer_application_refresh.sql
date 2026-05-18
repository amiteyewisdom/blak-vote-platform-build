create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  full_name text,
  first_name text,
  last_name text,
  role text not null default 'voter',
  status text not null default 'active',
  email_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists last_name text;
alter table public.users add column if not exists role text not null default 'voter';
alter table public.users add column if not exists status text not null default 'active';
alter table public.users add column if not exists email_verified boolean not null default false;
alter table public.users add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.users add column if not exists updated_at timestamptz not null default timezone('utc', now());
alter table public.users add column if not exists suspended_at timestamptz;
alter table public.users add column if not exists suspended_reason text;

update public.users
set full_name = nullif(trim(concat_ws(' ', first_name, last_name)), '')
where (full_name is null or trim(full_name) = '')
  and (coalesce(first_name, '') <> '' or coalesce(last_name, '') <> '');

update public.users
set email_verified = true
where email_verified is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_valid'
  ) then
    alter table public.users
      add constraint users_role_valid
      check (role in ('admin', 'organizer', 'voter'));
  end if;
end $$;

create unique index if not exists users_email_lower_unique_idx
  on public.users (lower(email));

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  refresh_token text not null,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  last_used_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.sessions add column if not exists ip_address text;
alter table public.sessions add column if not exists user_agent text;
alter table public.sessions add column if not exists last_used_at timestamptz not null default timezone('utc', now());
alter table public.sessions add column if not exists created_at timestamptz not null default timezone('utc', now());

create unique index if not exists sessions_refresh_token_unique_idx
  on public.sessions (refresh_token);

create index if not exists sessions_user_id_expires_idx
  on public.sessions (user_id, expires_at desc);

create table if not exists public.email_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text,
  purpose text,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  verified boolean not null default false,
  payload jsonb,
  resend_available_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.email_otps add column if not exists otp_hash text;
alter table public.email_otps add column if not exists purpose text;
alter table public.email_otps add column if not exists attempts integer not null default 0;
alter table public.email_otps add column if not exists payload jsonb;
alter table public.email_otps add column if not exists resend_available_at timestamptz;
alter table public.email_otps add column if not exists verified_at timestamptz;

update public.email_otps
set purpose = case
  when coalesce(type, '') = 'signup' then 'signup'
  when coalesce(type, '') = 'reset' then 'reset_password'
  else purpose
end
where purpose is null;

update public.email_otps
set verified = true
where otp_hash is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_otps_purpose_valid'
  ) then
    alter table public.email_otps
      add constraint email_otps_purpose_valid
      check (purpose in ('signup', 'reset_password'));
  end if;
end $$;

create index if not exists email_otps_lookup_idx_v2
  on public.email_otps (email, purpose, verified, expires_at desc);

create table if not exists public.organizer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  organization_name text,
  organization_id text,
  address text,
  phone_number text,
  description text,
  document_url text,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  company text,
  bio text,
  phone text,
  email text,
  id_type text,
  id_number text,
  submitted_at timestamptz not null default timezone('utc', now())
);

alter table public.organizer_applications add column if not exists user_id uuid references public.users(id) on delete set null;
alter table public.organizer_applications add column if not exists organization_name text;
alter table public.organizer_applications add column if not exists organization_id text;
alter table public.organizer_applications add column if not exists address text;
alter table public.organizer_applications add column if not exists phone_number text;
alter table public.organizer_applications add column if not exists description text;
alter table public.organizer_applications add column if not exists document_url text;
alter table public.organizer_applications add column if not exists status text not null default 'pending';
alter table public.organizer_applications add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.organizer_applications add column if not exists reviewed_at timestamptz;
alter table public.organizer_applications add column if not exists company text;
alter table public.organizer_applications add column if not exists bio text;
alter table public.organizer_applications add column if not exists phone text;
alter table public.organizer_applications add column if not exists email text;
alter table public.organizer_applications add column if not exists submitted_at timestamptz not null default timezone('utc', now());

update public.organizer_applications
set organization_name = coalesce(nullif(organization_name, ''), company),
    organization_id = coalesce(nullif(organization_id, ''), id_number),
    phone_number = coalesce(nullif(phone_number, ''), phone),
    description = coalesce(nullif(description, ''), bio),
    created_at = coalesce(created_at, submitted_at, timezone('utc', now()))
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizer_applications_status_valid'
  ) then
    alter table public.organizer_applications
      add constraint organizer_applications_status_valid
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists organizer_applications_user_status_idx
  on public.organizer_applications (user_id, status, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organizer-documents',
  'organizer-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;