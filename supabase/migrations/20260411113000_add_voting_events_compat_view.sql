-- Compatibility shim for legacy RPCs that still reference voting_events.
-- The current canonical table is events.
CREATE OR REPLACE VIEW voting_events AS
SELECT *
FROM events;

GRANT SELECT ON voting_events TO anon, authenticated, service_role;
