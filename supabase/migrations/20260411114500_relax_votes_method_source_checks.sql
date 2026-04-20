DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_payment_method_check'
  ) THEN
    ALTER TABLE votes DROP CONSTRAINT votes_payment_method_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_vote_source_check'
  ) THEN
    ALTER TABLE votes DROP CONSTRAINT votes_vote_source_check;
  END IF;
END;
$$;

UPDATE votes
SET payment_method = COALESCE(payment_method, 'paystack'),
    vote_source = COALESCE(vote_source, 'online')
WHERE payment_method IS NULL OR vote_source IS NULL;

ALTER TABLE votes
  ALTER COLUMN payment_method SET DEFAULT 'paystack',
  ALTER COLUMN vote_source SET DEFAULT 'online';
