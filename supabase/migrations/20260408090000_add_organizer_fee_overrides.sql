-- =============================================================================
-- Migration: Organizer-Specific Platform Fee Overrides
--
-- Purpose:
--   1) Allow admins to define platform fee percent per organizer.
--   2) Keep existing global platform_settings.platform_fee_percent as fallback.
--   3) Apply override consistently in wallet, event earnings, admin revenue,
--      and organizer withdrawal calculations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizer_fee_overrides (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_user_id UUID NOT NULL UNIQUE,
  platform_fee_percent NUMERIC(5, 2) NOT NULL CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100),
  updated_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT organizer_fee_overrides_organizer_user_fk
    FOREIGN KEY (organizer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT organizer_fee_overrides_updated_by_fk
    FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_organizer_fee_overrides_updated_at
  ON organizer_fee_overrides (updated_at DESC);

CREATE OR REPLACE FUNCTION organizer_fee_overrides_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizer_fee_overrides_set_updated_at ON organizer_fee_overrides;
CREATE TRIGGER trg_organizer_fee_overrides_set_updated_at
  BEFORE UPDATE ON organizer_fee_overrides
  FOR EACH ROW
  EXECUTE FUNCTION organizer_fee_overrides_set_updated_at();

-- Resolve effective platform fee with fallback order:
-- 1) organizer_fee_overrides.platform_fee_percent
-- 2) platform_settings.platform_fee_percent
-- 3) hard fallback 10
--
-- Supports both organizer_id styles used in events:
-- - auth.users.id
-- - organizers.id (mapped to organizers.user_id)
CREATE OR REPLACE FUNCTION get_effective_platform_fee_percent(p_organizer_ref UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_override NUMERIC;
  v_default NUMERIC;
BEGIN
  IF p_organizer_ref IS NULL THEN
    SELECT COALESCE(platform_fee_percent, 10)
    INTO v_default
    FROM platform_settings
    LIMIT 1;

    RETURN COALESCE(v_default, 10);
  END IF;

  v_user_id := p_organizer_ref;

  SELECT o.user_id
  INTO v_user_id
  FROM organizers o
  WHERE o.id = p_organizer_ref
  LIMIT 1;

  v_user_id := COALESCE(v_user_id, p_organizer_ref);

  SELECT ofo.platform_fee_percent
  INTO v_override
  FROM organizer_fee_overrides ofo
  WHERE ofo.organizer_user_id = v_user_id
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT COALESCE(platform_fee_percent, 10)
  INTO v_default
  FROM platform_settings
  LIMIT 1;

  RETURN COALESCE(v_default, 10);
END;
$$;

CREATE OR REPLACE FUNCTION update_event_earnings_on_vote(
  p_organizer_id UUID,
  p_event_id TEXT,
  p_amount_paid NUMERIC,
  p_vote_type TEXT DEFAULT 'free'
)
RETURNS VOID AS $$
DECLARE
  v_platform_fee_percent NUMERIC;
  v_fee_amount NUMERIC;
  v_net_amount NUMERIC;
BEGIN
  SELECT get_effective_platform_fee_percent(p_organizer_id) INTO v_platform_fee_percent;

  v_fee_amount := CASE
    WHEN p_vote_type = 'paid' AND p_amount_paid > 0 THEN (p_amount_paid * v_platform_fee_percent / 100)
    ELSE 0
  END;

  v_net_amount := p_amount_paid - v_fee_amount;

  INSERT INTO organizer_event_earnings (
    organizer_id,
    event_id,
    total_votes,
    paid_votes,
    free_votes,
    total_revenue,
    platform_fee_percent,
    platform_fee_deducted,
    net_earnings,
    updated_at
  )
  VALUES (
    p_organizer_id,
    p_event_id,
    1,
    CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    CASE WHEN p_vote_type = 'free' THEN 1 ELSE 0 END,
    p_amount_paid,
    v_platform_fee_percent,
    v_fee_amount,
    v_net_amount,
    timezone('utc', now())
  )
  ON CONFLICT (organizer_id, event_id) DO UPDATE SET
    total_votes = organizer_event_earnings.total_votes + 1,
    paid_votes = organizer_event_earnings.paid_votes + CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    free_votes = organizer_event_earnings.free_votes + CASE WHEN p_vote_type = 'free' THEN 1 ELSE 0 END,
    total_revenue = organizer_event_earnings.total_revenue + p_amount_paid,
    platform_fee_deducted = organizer_event_earnings.platform_fee_deducted + v_fee_amount,
    net_earnings = organizer_event_earnings.net_earnings + v_net_amount,
    updated_at = timezone('utc', now());
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_organizer_wallet_on_vote(
  p_organizer_id UUID,
  p_amount_paid NUMERIC,
  p_vote_type TEXT DEFAULT 'free'
)
RETURNS VOID AS $$
DECLARE
  v_platform_fee_percent NUMERIC;
  v_fee_amount NUMERIC;
  v_net_amount NUMERIC;
BEGIN
  PERFORM initialize_organizer_wallet(p_organizer_id);

  SELECT get_effective_platform_fee_percent(p_organizer_id) INTO v_platform_fee_percent;

  v_fee_amount := CASE
    WHEN p_vote_type = 'paid' AND p_amount_paid > 0 THEN (p_amount_paid * v_platform_fee_percent / 100)
    ELSE 0
  END;

  v_net_amount := p_amount_paid - v_fee_amount;

  UPDATE organizer_wallets
  SET
    total_revenue = total_revenue + p_amount_paid,
    total_paid_votes = total_paid_votes + CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    platform_fees_deducted = platform_fees_deducted + v_fee_amount,
    net_balance = net_balance + v_net_amount,
    last_updated = timezone('utc', now())
  WHERE organizer_id = p_organizer_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_capture_admin_revenue_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vote_type TEXT;
  v_vote_amount NUMERIC;
  v_platform_fee_percent NUMERIC;
  v_gross_amount NUMERIC;
  v_platform_fee_amount NUMERIC;
  v_event_title TEXT;
  v_organizer_id UUID;
BEGIN
  IF NEW.status NOT IN ('processed', 'success') OR NEW.vote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vote_type, COALESCE(amount_paid, 0)
  INTO v_vote_type, v_vote_amount
  FROM votes
  WHERE id::text = NEW.vote_id;

  IF v_vote_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.title, e.organizer_id
  INTO v_event_title, v_organizer_id
  FROM events e
  WHERE e.id = NEW.event_id;

  IF v_organizer_id IS NULL THEN
    SELECT COALESCE(platform_fee_percent, 10)
    INTO v_platform_fee_percent
    FROM platform_settings
    LIMIT 1;
  ELSE
    SELECT get_effective_platform_fee_percent(v_organizer_id)
    INTO v_platform_fee_percent;
  END IF;

  v_gross_amount := COALESCE(NEW.amount, v_vote_amount, 0);

  v_platform_fee_amount := CASE
    WHEN v_vote_type = 'paid' AND v_gross_amount > 0
      THEN (v_gross_amount * v_platform_fee_percent / 100)
    ELSE 0
  END;

  INSERT INTO admin_revenue_transactions (
    payment_id,
    payment_reference,
    event_id,
    event_title,
    organizer_id,
    vote_id,
    vote_type,
    gross_amount,
    platform_fee_percent,
    platform_fee_amount,
    organizer_net_amount,
    processed_at
  )
  VALUES (
    NEW.id::text,
    NEW.reference,
    NEW.event_id,
    v_event_title,
    v_organizer_id,
    NEW.vote_id,
    v_vote_type,
    v_gross_amount,
    v_platform_fee_percent,
    v_platform_fee_amount,
    (v_gross_amount - v_platform_fee_amount),
    COALESCE(NEW.processed_at, NEW.verified_at, NEW.updated_at, NEW.created_at, timezone('utc', now()))
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION request_organizer_withdrawal(
  p_organizer_id UUID,
  p_amount NUMERIC,
  p_method TEXT DEFAULT 'bank_transfer',
  p_account_details JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  withdrawal_id BIGINT,
  amount_requested NUMERIC,
  platform_fee_amount NUMERIC,
  net_amount NUMERIC,
  status TEXT,
  requested_at TIMESTAMPTZ
) AS $$
DECLARE
  v_available NUMERIC;
  v_fee_percent NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  SELECT get_organizer_available_balance(p_organizer_id) INTO v_available;

  IF p_amount > COALESCE(v_available, 0) THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  SELECT get_effective_platform_fee_percent(p_organizer_id)
  INTO v_fee_percent;

  v_fee := (p_amount * v_fee_percent / 100);
  v_net := GREATEST(p_amount - v_fee, 0);

  RETURN QUERY
  INSERT INTO organizer_withdrawals (
    organizer_id,
    amount_requested,
    platform_fee_percent,
    platform_fee_amount,
    net_amount,
    method,
    account_details,
    status,
    requested_at
  )
  VALUES (
    p_organizer_id,
    p_amount,
    v_fee_percent,
    v_fee,
    v_net,
    COALESCE(NULLIF(trim(p_method), ''), 'bank_transfer'),
    COALESCE(p_account_details, '{}'::jsonb),
    'pending',
    timezone('utc', now())
  )
  RETURNING
    id,
    organizer_withdrawals.amount_requested,
    organizer_withdrawals.platform_fee_amount,
    organizer_withdrawals.net_amount,
    organizer_withdrawals.status,
    organizer_withdrawals.requested_at;
END;
$$ LANGUAGE plpgsql;
