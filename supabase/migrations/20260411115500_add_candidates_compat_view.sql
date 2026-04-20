-- Compatibility shim for legacy database functions/triggers that still query public.candidates.
-- Canonical table is nominations.
CREATE OR REPLACE VIEW candidates AS
SELECT
  n.id,
  n.event_id,
  n.nominee_name AS name,
  n.nominee_name,
  n.bio,
  n.photo_url,
  n.voting_code,
  n.short_code,
  n.vote_count,
  n.category_id,
  n.created_at,
  n.updated_at
FROM nominations n;

GRANT SELECT ON candidates TO anon, authenticated, service_role;
