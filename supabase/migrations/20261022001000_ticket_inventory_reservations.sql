-- Ticket inventory reservations: hold slots while a paid checkout is in flight
-- so the same seat can never be sold twice. Holds are consumed on issuance
-- and released on payment failure or by stale-payment cleanup.

alter table public.tickets
  add column if not exists reserved_count integer not null default 0;

alter table public.payments
  add column if not exists reserved_ticket_quantity integer not null default 0;

-- Atomically hold p_quantity slots on a plan for a payment reference.
create or replace function public.reserve_ticket_inventory(
  p_plan_id text,
  p_payment_reference text,
  p_quantity integer
)
returns void
language plpgsql
as $$
declare
  v_plan tickets%rowtype;
  v_available integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Ticket quantity must be at least 1';
  end if;

  select * into v_plan
  from tickets
  where id::text = p_plan_id
  for update;

  if not found then
    raise exception 'Ticket plan not found';
  end if;

  if coalesce(v_plan.ticket_kind, 'issued') <> 'plan' then
    raise exception 'Only ticket plans can be reserved';
  end if;

  v_available := greatest(
    coalesce(v_plan.quantity, 0)
      - coalesce(v_plan.sold_count, 0)
      - coalesce(v_plan.reserved_count, 0),
    0
  );

  if v_available < p_quantity then
    raise exception 'Only % tickets remaining for this plan', v_available;
  end if;

  update tickets
  set
    reserved_count = coalesce(reserved_count, 0) + p_quantity,
    updated_at = timezone('utc', now())
  where id = v_plan.id;

  if p_payment_reference is not null and p_payment_reference <> '' then
    update payments
    set reserved_ticket_quantity = p_quantity
    where reference = p_payment_reference;
  end if;
end;
$$;

-- Idempotently release a payment's held slots. Safe to call multiple times.
create or replace function public.release_ticket_reservation(
  p_payment_reference text
)
returns integer
language plpgsql
as $$
declare
  v_payment payments%rowtype;
  v_released integer;
begin
  select * into v_payment
  from payments
  where reference = p_payment_reference
  for update;

  if not found then
    return 0;
  end if;

  v_released := greatest(coalesce(v_payment.reserved_ticket_quantity, 0), 0);

  if v_released <= 0 then
    return 0;
  end if;

  update payments
  set reserved_ticket_quantity = 0
  where id = v_payment.id;

  update tickets
  set
    reserved_count = greatest(coalesce(reserved_count, 0) - v_released, 0),
    updated_at = timezone('utc', now())
  where id::text = coalesce(v_payment.metadata ->> 'ticketId', '');

  return v_released;
end;
$$;

-- Issuance must respect outstanding holds, while atomically consuming the
-- hold that belongs to the paying reference itself.
create or replace function public.issue_ticket_purchase(
  p_plan_id text,
  p_payment_reference text,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_quantity integer default 1
)
returns table(ticket_id text, ticket_code text)
language plpgsql
as $$
declare
  v_plan tickets%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_available integer;
  v_own_hold integer := 0;
begin
  if p_plan_id is null or trim(p_plan_id) = '' then
    raise exception 'Ticket plan is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Ticket quantity must be at least 1';
  end if;

  -- Slots this payment already reserved at checkout.
  if p_payment_reference is not null and p_payment_reference <> '' then
    select coalesce(p.reserved_ticket_quantity, 0)
    into v_own_hold
    from payments p
    where p.reference = p_payment_reference
    for update;
    v_own_hold := greatest(coalesce(v_own_hold, 0), 0);
  end if;

  select *
  into v_plan
  from tickets
  where id::text = p_plan_id
  for update;

  if not found then
    raise exception 'Ticket plan not found';
  end if;

  if coalesce(v_plan.ticket_kind, 'issued') <> 'plan' then
    raise exception 'Only ticket plans can be issued';
  end if;

  v_available := greatest(
    coalesce(v_plan.quantity, 0)
      - coalesce(v_plan.sold_count, 0)
      - coalesce(v_plan.reserved_count, 0)
      + v_own_hold,
    0
  );

  if v_available < p_quantity then
    raise exception 'Only % tickets remaining for this plan', v_available;
  end if;

  update tickets
  set
    sold_count = coalesce(sold_count, 0) + p_quantity,
    reserved_count = greatest(coalesce(reserved_count, 0) - least(v_own_hold, p_quantity), 0),
    updated_at = v_now
  where id = v_plan.id;

  if p_payment_reference is not null and p_payment_reference <> '' then
    update payments
    set reserved_ticket_quantity = greatest(coalesce(reserved_ticket_quantity, 0) - p_quantity, 0)
    where reference = p_payment_reference;
  end if;

  return query
  with inserted as (
    insert into tickets (
      event_id,
      parent_ticket_id,
      ticket_kind,
      ticket_type,
      name,
      price,
      quantity,
      admin_fee,
      ticket_code,
      status,
      usage_status,
      payment_reference,
      buyer_name,
      buyer_email,
      buyer_phone,
      purchased_at,
      created_at,
      updated_at
    )
    select
      v_plan.event_id,
      v_plan.id,
      'issued',
      coalesce(v_plan.ticket_type, case when coalesce(v_plan.price, 0) > 0 then 'paid' else 'free' end),
      v_plan.name,
      v_plan.price,
      1,
      coalesce(v_plan.admin_fee, 0),
      upper(substr(md5(random()::text || clock_timestamp()::text || series_number::text || coalesce(p_payment_reference, 'FREE')), 1, 12)),
      'valid',
      'unused',
      p_payment_reference,
      p_buyer_name,
      p_buyer_email,
      p_buyer_phone,
      v_now,
      v_now,
      v_now
    from generate_series(1, p_quantity) as series_number
    returning id::text as ticket_id, tickets.ticket_code as ticket_code
  )
  select inserted.ticket_id, inserted.ticket_code
  from inserted;
end;
$$;
