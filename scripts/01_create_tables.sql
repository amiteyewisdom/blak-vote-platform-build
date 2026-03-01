-- BlakVote Database Schema

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'voter',
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voting events
CREATE TABLE IF NOT EXISTS public.voting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  voting_type TEXT NOT NULL DEFAULT 'single_choice',
  cost_per_vote DECIMAL(10, 2) DEFAULT 0,
  is_private BOOLEAN DEFAULT FALSE,
  results_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voting options/choices
CREATE TABLE IF NOT EXISTS public.voting_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.voting_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voter registrations
CREATE TABLE IF NOT EXISTS public.voter_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.voting_events(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email TEXT,
  name TEXT,
  token TEXT UNIQUE,
  voted BOOLEAN DEFAULT FALSE,
  voted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Votes
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.voting_events(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.voting_options(id) ON DELETE CASCADE,
  voter_registration_id UUID NOT NULL REFERENCES public.voter_registrations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_registration_id UUID NOT NULL REFERENCES public.voter_registrations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.voting_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  stripe_payment_intent_id TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event participants tracking
CREATE TABLE IF NOT EXISTS public.event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.voting_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant',
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_voting_events_organizer_id ON public.voting_events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_voting_events_status ON public.voting_events(status);
CREATE INDEX IF NOT EXISTS idx_voting_options_event_id ON public.voting_options(event_id);
CREATE INDEX IF NOT EXISTS idx_voter_registrations_event_id ON public.voter_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_voter_registrations_token ON public.voter_registrations(token);
CREATE INDEX IF NOT EXISTS idx_votes_event_id ON public.votes(event_id);
CREATE INDEX IF NOT EXISTS idx_votes_option_id ON public.votes(option_id);
CREATE INDEX IF NOT EXISTS idx_payments_event_id ON public.payments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON public.event_participants(event_id);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voter_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Voting events policies
CREATE POLICY "Anyone can view published events" ON public.voting_events
  FOR SELECT USING (NOT is_private OR auth.uid() = organizer_id);

CREATE POLICY "Organizers can manage their events" ON public.voting_events
  FOR ALL USING (auth.uid() = organizer_id);

-- Voting options policies
CREATE POLICY "Anyone can view voting options for published events" ON public.voting_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.voting_events 
      WHERE voting_events.id = voting_options.event_id 
      AND (NOT voting_events.is_private OR auth.uid() = voting_events.organizer_id)
    )
  );

-- Voter registrations policies
CREATE POLICY "Anyone can view their own registration" ON public.voter_registrations
  FOR SELECT USING (
    auth.uid() = voter_id 
    OR token = current_setting('app.voter_token', true)
  );

-- Votes policies
CREATE POLICY "Users can view votes for public events" ON public.votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.voting_events
      WHERE voting_events.id = votes.event_id
      AND (results_visible AND NOT is_private)
    )
  );
