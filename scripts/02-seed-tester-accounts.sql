-- Insert tester accounts into the users table
-- Note: Using bcrypt hashed passwords for test accounts

-- Admin tester account
INSERT INTO users (email, password_hash, role, first_name, last_name, status, created_at, updated_at)
VALUES (
  'admin@blakvote.test',
  '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', -- password: admin123
  'admin',
  'Admin',
  'Tester',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Organizer tester account
INSERT INTO users (email, password_hash, role, first_name, last_name, status, created_at, updated_at)
VALUES (
  'organizer@blakvote.test',
  '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', -- password: organizer123
  'organizer',
  'Organizer',
  'Tester',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Voter tester account 1
INSERT INTO users (email, password_hash, role, first_name, last_name, status, created_at, updated_at)
VALUES (
  'voter1@blakvote.test',
  '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', -- password: voter123
  'voter',
  'Voter',
  'One',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Voter tester account 2
INSERT INTO users (email, password_hash, role, first_name, last_name, status, created_at, updated_at)
VALUES (
  'voter2@blakvote.test',
  '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', -- password: voter123
  'voter',
  'Voter',
  'Two',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Voter tester account 3
INSERT INTO users (email, password_hash, role, first_name, last_name, status, created_at, updated_at)
VALUES (
  'voter3@blakvote.test',
  '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', -- password: voter123
  'voter',
  'Voter',
  'Three',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Get organizer user ID for sample event creation
-- Note: In a real scenario, you'd link the organizer account to organizers table first

-- Create organizer profile for organizer@blakvote.test
INSERT INTO organizers (user_id, business_name, business_description, status)
SELECT id, 'Test Organization Inc', 'A test organization for BlakVote demo', 'approved'
FROM users WHERE email = 'organizer@blakvote.test'
ON CONFLICT (user_id) DO NOTHING;

-- Create sample voting event for testing
INSERT INTO events (organizer_id, title, description, start_date, end_date, vote_price, status, created_at, updated_at)
SELECT 
  o.id,
  'Sample Presidential Election',
  'This is a demo voting event for testing the BlakVote platform. Vote for your preferred candidate.',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '7 days',
  0,
  'active',
  NOW(),
  NOW()
FROM organizers o
WHERE o.user_id = (SELECT id FROM users WHERE email = 'organizer@blakvote.test')
ON CONFLICT DO NOTHING;

-- Create sample candidates for the event
INSERT INTO candidates (event_id, name, bio, voting_code, created_at)
SELECT 
  e.id,
  'Alice Johnson',
  'Technology entrepreneur with 15 years of experience in digital innovation and public service.',
  'ALICE001',
  NOW()
FROM events e
WHERE e.title = 'Sample Presidential Election'
ON CONFLICT (voting_code) DO NOTHING;

INSERT INTO candidates (event_id, name, bio, voting_code, created_at)
SELECT 
  e.id,
  'Bob Smith',
  'Education reformer dedicated to improving schools and student outcomes across the nation.',
  'BOB001',
  NOW()
FROM events e
WHERE e.title = 'Sample Presidential Election'
ON CONFLICT (voting_code) DO NOTHING;

INSERT INTO candidates (event_id, name, bio, voting_code, created_at)
SELECT 
  e.id,
  'Carol Williams',
  'Environmental advocate with a strong track record in sustainable policy implementation.',
  'CAROL001',
  NOW()
FROM events e
WHERE e.title = 'Sample Presidential Election'
ON CONFLICT (voting_code) DO NOTHING;
