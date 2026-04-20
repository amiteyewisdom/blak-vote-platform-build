-- =============================================================================
-- Migration: Add bulk vote packages for organizer-configurable vote discounts
--
-- Purpose:
--   Organizers can create bulk vote packages during event setup.
--   Voters can purchase these packages for discounted per-vote pricing.
--   Example: "10 votes for ₦500" (vs ₦100 per vote = ₦1000 retail)
-- =============================================================================

-- Bulk vote packages configured by organizer per event
CREATE TABLE IF NOT EXISTS bulk_vote_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  votes_included INTEGER NOT NULL CHECK (votes_included > 0),
  price_per_package NUMERIC(12, 2) NOT NULL CHECK (price_per_package >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  CONSTRAINT bulk_vote_packages_event_id_fkey
    FOREIGN KEY (event_id)
    REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT bulk_vote_packages_unique_per_event
    UNIQUE (event_id, votes_included)
);

-- Manual voting category (for organizer categorization)
-- Used by organizers to label manual votes (e.g., "Offline votes", "System adjustment")
CREATE TABLE IF NOT EXISTS manual_vote_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  CONSTRAINT manual_vote_categories_event_id_fkey
    FOREIGN KEY (event_id)
    REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT manual_vote_categories_unique_per_event
    UNIQUE (event_id, name)
);

-- Add category_for_manual field to vote_manual_audit_context
ALTER TABLE vote_manual_audit_context
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS manual_reason_category TEXT;

-- Index for bulk vote package lookups
CREATE INDEX IF NOT EXISTS idx_bulk_vote_packages_event_id
  ON bulk_vote_packages (event_id, is_active);

-- Index for manual vote categories
CREATE INDEX IF NOT EXISTS idx_manual_vote_categories_event_id
  ON manual_vote_categories (event_id);
