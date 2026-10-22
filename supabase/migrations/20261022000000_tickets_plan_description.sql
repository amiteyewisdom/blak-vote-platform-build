-- Add optional description to ticket plans (shown at checkout).
alter table public.tickets
  add column if not exists description text;
