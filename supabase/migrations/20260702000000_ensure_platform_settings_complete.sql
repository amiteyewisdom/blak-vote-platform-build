-- Ensure platform_settings table exists with all required columns.
-- Safe to run multiple times (all statements are idempotent).

CREATE TABLE IF NOT EXISTS platform_settings (
  id                            serial PRIMARY KEY,
  platform_fee_percent          numeric(5,2)  NOT NULL DEFAULT 10,
  platform_name                 text          NOT NULL DEFAULT 'BlakVote',
  max_events_per_organizer      integer       NOT NULL DEFAULT 10,
  ticketing_commission_percent  numeric(5,2)           DEFAULT 10,
  enable_fraud_detection        boolean       NOT NULL DEFAULT true,
  require_email_verification    boolean       NOT NULL DEFAULT true,
  maintenance_mode              boolean       NOT NULL DEFAULT false,
  updated_at                    timestamptz            DEFAULT now()
);

-- Add any columns that may be missing if the table already existed
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS platform_name                text          NOT NULL DEFAULT 'BlakVote',
  ADD COLUMN IF NOT EXISTS max_events_per_organizer     integer       NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ticketing_commission_percent numeric(5,2)           DEFAULT 10,
  ADD COLUMN IF NOT EXISTS enable_fraud_detection       boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_email_verification   boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS maintenance_mode             boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at                   timestamptz            DEFAULT now();

-- Seed a default row if none exists
INSERT INTO platform_settings (
  platform_fee_percent,
  platform_name,
  max_events_per_organizer,
  ticketing_commission_percent,
  enable_fraud_detection,
  require_email_verification,
  maintenance_mode,
  updated_at
)
SELECT 10, 'BlakVote', 10, 10, true, true, false, now()
WHERE NOT EXISTS (SELECT 1 FROM platform_settings LIMIT 1);
