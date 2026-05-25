-- ============================================================================
-- Migration: Super Admin Role + Enum Fixes
-- ============================================================================

-- Add missing event status values to the enum (ALTER TYPE ADD VALUE is idempotent-safe via DO block)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status_enum') THEN
    BEGIN
      ALTER TYPE event_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
      ALTER TYPE event_status_enum ADD VALUE IF NOT EXISTS 'deleted';
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users (is_super_admin) WHERE is_super_admin = true;

COMMENT ON COLUMN users.is_super_admin IS
  'Super admins can impersonate any account and have platform-wide settings control.';
