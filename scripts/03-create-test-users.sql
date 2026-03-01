-- First, delete any existing test users to avoid conflicts
DELETE FROM users WHERE email IN (
  'admin@blakvote.test',
  'organizer@blakvote.test',
  'voter1@blakvote.test',
  'voter2@blakvote.test',
  'voter3@blakvote.test'
);

-- Note: In Supabase, users must be created through the Auth API, not directly in SQL
-- The seed data below are user profiles that should be created AFTER the auth users exist
-- Use the Supabase dashboard or auth API to create these accounts first:
--
-- Email: admin@blakvote.test | Password: admin123
-- Email: organizer@blakvote.test | Password: organizer123
-- Email: voter1@blakvote.test | Password: voter123
-- Email: voter2@blakvote.test | Password: voter123
-- Email: voter3@blakvote.test | Password: voter123
--
-- Then create the user profiles with their auth IDs

-- Example SQL to insert profiles after auth users are created:
-- INSERT INTO users (id, email, role, first_name, last_name, status, created_at, updated_at)
-- VALUES 
--   ('AUTH_ID_1', 'admin@blakvote.test', 'admin', 'Admin', 'Tester', 'active', NOW(), NOW()),
--   ('AUTH_ID_2', 'organizer@blakvote.test', 'organizer', 'Organizer', 'Tester', 'active', NOW(), NOW()),
--   ('AUTH_ID_3', 'voter1@blakvote.test', 'voter', 'Voter', 'One', 'active', NOW(), NOW()),
--   ('AUTH_ID_4', 'voter2@blakvote.test', 'voter', 'Voter', 'Two', 'active', NOW(), NOW()),
--   ('AUTH_ID_5', 'voter3@blakvote.test', 'voter', 'Voter', 'Three', 'active', NOW(), NOW());
