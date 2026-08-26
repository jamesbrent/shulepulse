-- Migration 089: Add accepted_terms_at column to schools table
-- Records when a school accepted the Terms of Service & Privacy Policy during onboarding.

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;

COMMENT ON COLUMN schools.accepted_terms_at IS 'Timestamp when the school accepted Terms of Service & Privacy Policy during onboarding.';

-- Backfill existing active schools with a NULL value (already the default).
-- New onboarded schools will get a timestamp from the onboardingService.
