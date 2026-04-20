-- Add organizer settings storage and ensure admin settings columns exist.

CREATE TABLE IF NOT EXISTS organizer_settings (
  organizer_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  enable_notifications boolean NOT NULL DEFAULT true,
  enable_public_results boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS platform_settings
  ADD COLUMN IF NOT EXISTS platform_name text DEFAULT 'BlakVote',
  ADD COLUMN IF NOT EXISTS max_events_per_organizer integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS enable_fraud_detection boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_email_verification boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS maintenance_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE organizer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizer_settings_select_own ON organizer_settings;
CREATE POLICY organizer_settings_select_own
  ON organizer_settings
  FOR SELECT
  USING (auth.uid() = organizer_user_id);

DROP POLICY IF EXISTS organizer_settings_upsert_own ON organizer_settings;
CREATE POLICY organizer_settings_upsert_own
  ON organizer_settings
  FOR ALL
  USING (auth.uid() = organizer_user_id)
  WITH CHECK (auth.uid() = organizer_user_id);
