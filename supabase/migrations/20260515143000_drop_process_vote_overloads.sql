-- =============================================================================
-- Migration: Remove ambiguous process_vote overloads
--
-- Supabase/PostgREST cannot resolve RPC calls when multiple process_vote()
-- signatures exist with overlapping named parameters. Keep a single canonical
-- signature and drop the legacy overloads that were causing PGRST203.
-- =============================================================================

DROP FUNCTION IF EXISTS public.process_vote(
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric
);

DROP FUNCTION IF EXISTS public.process_vote(
  uuid,
  uuid,
  integer,
  uuid,
  character varying,
  character varying,
  character varying,
  character varying,
  inet,
  numeric
);

CREATE OR REPLACE FUNCTION public.process_vote(
  p_event_id        uuid,
  p_candidate_id    uuid,
  p_quantity        integer,
  p_voter_id        uuid    DEFAULT NULL,
  p_voter_phone     text    DEFAULT NULL,
  p_vote_source     text    DEFAULT 'online',
  p_payment_method  text    DEFAULT 'paystack',
  p_transaction_id  text    DEFAULT NULL,
  p_ip_address      text    DEFAULT NULL,
  p_amount_paid     numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO votes (
    event_id,
    candidate_id,
    voter_id,
    quantity,
    payment_method,
    amount_paid,
    transaction_id,
    status,
    voter_phone,
    vote_source
  ) VALUES (
    p_event_id,
    p_candidate_id,
    p_voter_id,
    p_quantity,
    p_payment_method,
    COALESCE(p_amount_paid, 0),
    p_transaction_id,
    'paid',
    p_voter_phone,
    p_vote_source
  );
END;
$$;
