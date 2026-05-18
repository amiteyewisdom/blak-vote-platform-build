do $$
begin
  if to_regclass('public.audit_logs') is not null then
    alter table public.audit_logs
      add column if not exists severity text not null default 'info';

    alter table public.audit_logs
      add column if not exists timestamp timestamptz not null default timezone('utc', now());

    alter table public.audit_logs
      add column if not exists resolved boolean not null default false;

    create index if not exists audit_logs_timestamp_idx
      on public.audit_logs (timestamp desc);

    create index if not exists audit_logs_action_timestamp_idx
      on public.audit_logs (action, timestamp desc);
  end if;
end $$;