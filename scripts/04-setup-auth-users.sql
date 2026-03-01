-- This script deletes old incorrectly seeded users and clears the way for proper auth

-- Delete old test users (they have fake password hashes)
DELETE FROM users WHERE email IN (
  'admin@blakvote.test',
  'organizer@blakvote.test', 
  'voter1@blakvote.test',
  'voter2@blakvote.test',
  'voter3@blakvote.test'
);

-- Note: Users should now be created through the sign-up form at /auth/sign-up
-- After signing up, they will be automatically assigned the 'voter' role
-- To test admin and organizer accounts, either:
-- 1. Update their role via the admin dashboard
-- 2. Or manually update in this SQL:
--    UPDATE users SET role = 'admin' WHERE email = 'admin@blakvote.test';
--    UPDATE users SET role = 'organizer' WHERE email = 'organizer@blakvote.test';
