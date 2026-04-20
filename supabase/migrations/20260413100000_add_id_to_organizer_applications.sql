ALTER TABLE organizer_applications
  ADD COLUMN IF NOT EXISTS id_type TEXT,
  ADD COLUMN IF NOT EXISTS id_number TEXT;
