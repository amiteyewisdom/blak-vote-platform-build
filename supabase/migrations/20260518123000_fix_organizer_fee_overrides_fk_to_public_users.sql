-- Fix organizer fee override foreign keys for custom auth setup.
-- The application stores user identities in public.users, so organizer fee
-- overrides must reference public.users(id) instead of auth.users(id).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizer_fee_overrides_organizer_user_fk'
  ) THEN
    ALTER TABLE public.organizer_fee_overrides
      DROP CONSTRAINT organizer_fee_overrides_organizer_user_fk;
  END IF;

  ALTER TABLE public.organizer_fee_overrides
    ADD CONSTRAINT organizer_fee_overrides_organizer_user_fk
    FOREIGN KEY (organizer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizer_fee_overrides_updated_by_fk'
  ) THEN
    ALTER TABLE public.organizer_fee_overrides
      DROP CONSTRAINT organizer_fee_overrides_updated_by_fk;
  END IF;

  ALTER TABLE public.organizer_fee_overrides
    ADD CONSTRAINT organizer_fee_overrides_updated_by_fk
    FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
END;
$$;
