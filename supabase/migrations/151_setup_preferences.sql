-- Migration 151: Setup preference columns on profiles
-- Supports the Guided Setup (Setup Assistant) coexisting with the normal
-- dashboard. Stores the new-school admin's first-login choice and when they
-- first completed the guided journey, so the choice survives device changes
-- (replaces the temporary localStorage approach client-side).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_choice TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_seen_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_setup_choice_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_setup_choice_check
      CHECK (setup_choice IN ('guided','dashboard') OR setup_choice IS NULL);
  END IF;
END $$;

COMMENT ON COLUMN profiles.setup_choice IS 'First-login choice: ''guided'' (Setup Assistant) or ''dashboard'' (normal ShulePulse).';
COMMENT ON COLUMN profiles.welcome_seen_at IS 'When the first-login Welcome modal was acknowledged.';
COMMENT ON COLUMN profiles.setup_completed_at IS 'When the Setup Assistant first reported all required steps complete.';