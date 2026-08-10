-- ─────────────────────────────────────────────────────────────────────────────
-- Subscription management: billing columns on schools
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schools ADD COLUMN IF NOT EXISTS billing_cycle      text DEFAULT 'monthly';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_start timestamptz;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_end   timestamptz;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_renew         boolean DEFAULT true;
