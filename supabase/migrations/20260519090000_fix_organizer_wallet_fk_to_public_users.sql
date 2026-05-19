-- Fix organizer wallet foreign keys for custom auth setup.
-- The application stores user identities in public.users, NOT auth.users.
-- All organizer wallet tables must reference public.users(id).

DO $$
BEGIN

  -- =========================================================================
  -- organizer_wallets.organizer_id
  -- =========================================================================
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizer_wallets_organizer_id_fk'
  ) THEN
    ALTER TABLE public.organizer_wallets
      DROP CONSTRAINT organizer_wallets_organizer_id_fk;
  END IF;

  ALTER TABLE public.organizer_wallets
    ADD CONSTRAINT organizer_wallets_organizer_id_fk
    FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;

  -- =========================================================================
  -- organizer_withdrawals.organizer_id
  -- =========================================================================
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizer_withdrawals_organizer_fk'
  ) THEN
    ALTER TABLE public.organizer_withdrawals
      DROP CONSTRAINT organizer_withdrawals_organizer_fk;
  END IF;

  ALTER TABLE public.organizer_withdrawals
    ADD CONSTRAINT organizer_withdrawals_organizer_fk
    FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;

  -- =========================================================================
  -- organizer_event_earnings.organizer_id
  -- =========================================================================
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizer_event_earnings_organizer_id_fk'
  ) THEN
    ALTER TABLE public.organizer_event_earnings
      DROP CONSTRAINT organizer_event_earnings_organizer_id_fk;
  END IF;

  ALTER TABLE public.organizer_event_earnings
    ADD CONSTRAINT organizer_event_earnings_organizer_id_fk
    FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;

END;
$$;
