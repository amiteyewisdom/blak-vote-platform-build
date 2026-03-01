# BlakVote - Tester Credentials

## Overview
This document contains all the pre-configured tester accounts created in the BlakVote database for testing and demonstration purposes.

## Theme
**Color Scheme:** Black and Gold
- **Primary Color:** Deep Black (#0 0% 12%)
- **Accent Color:** Luxurious Gold (#45 100% 55%)
- **Background:** Warm Cream-Beige (#25 15% 96%)

## Tester Accounts

### 1. Admin Account
**Email:** `admin@blakvote.test`
**Password:** `admin123456`
**Role:** Admin
**Full Name:** Admin Tester

**Permissions:**
- System-wide access
- User management
- Analytics and fraud detection
- System settings configuration

---

### 2. Organizer Account
**Email:** `organizer@blakvote.test`
**Password:** `organizer123456`
**Role:** Organizer
**Full Name:** Organizer Tester
**Business:** Test Organization Inc

**Permissions:**
- Create and manage voting events
- View event analytics and results
- Manage candidates
- View votes and voting statistics
- Process withdrawals

**Sample Event Created:**
- **Title:** Sample Presidential Election
- **Description:** Demo voting event for testing
- **Duration:** 7 days from creation
- **Status:** Active

---

### 3. Voter Accounts

#### Voter 1
**Email:** `voter1@blakvote.test`
**Password:** `voter123456`
**Role:** Voter
**Full Name:** Voter One

#### Voter 2
**Email:** `voter2@blakvote.test`
**Password:** `voter123456`
**Role:** Voter
**Full Name:** Voter Two

#### Voter 3
**Email:** `voter3@blakvote.test`
**Password:** `voter123456`
**Role:** Voter
**Full Name:** Voter Three

**Permissions:**
- Browse available voting events
- Cast votes for candidates
- View voting history
- Update personal settings

---

## Sample Voting Event Details

### Presidential Election (Demo)
**Event ID:** Generated automatically
**Organizer:** Test Organization Inc
**Status:** Active
**Voting Fee:** Free ($0)

### Candidates:
1. **Alice Johnson** - Code: ALICE001
   - Technology entrepreneur with 15 years of experience in digital innovation and public service

2. **Bob Smith** - Code: BOB001
   - Education reformer dedicated to improving schools and student outcomes across the nation

3. **Carol Williams** - Code: CAROL001
   - Environmental advocate with a strong track record in sustainable policy implementation

---

## Testing Scenarios

### Admin Testing
1. Log in as admin@blakvote.test
2. Navigate to Admin Dashboard
3. View user management
4. Check system analytics
5. Monitor fraud detection logs

### Organizer Testing
1. Log in as organizer@blakvote.test
2. Create new voting events
3. Add/edit candidates
4. View real-time voting results
5. Access detailed analytics

### Voter Testing
1. Log in as any voter account
2. Browse available events
3. Cast votes for candidates
4. View voting history
5. Update profile settings

---

## Security Notes
- These are test accounts only - do NOT use in production
- All accounts start with 'active' status
- Password hashes are stored securely in the database
- Modify credentials as needed for your testing environment

---

## Notes for Developers
- Sample event automatically created with 3 candidates
- All timestamps use server time (NOW())
- UUIDs auto-generated for all new records
- Organizer profile automatically created during seeding
- Voting codes (ALICE001, BOB001, CAROL001) ensure unique candidate tracking
