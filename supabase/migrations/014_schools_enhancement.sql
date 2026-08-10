-- ─────────────────────────────────────────────────────────────────────────────
-- Schools enhancement: code, modules, storage/usage columns
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. School code (e.g. SHP00125)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_code    text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS website        text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS modules_config jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS monthly_logins integer DEFAULT 0;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS sms_used       integer DEFAULT 0;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS sms_limit      integer DEFAULT 5000;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS emails_sent    integer DEFAULT 0;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS emails_limit   integer DEFAULT 50000;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS storage_used   numeric DEFAULT 0;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS storage_limit  numeric DEFAULT 10240; -- MB (10 GB)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS current_term   text DEFAULT 'Term 1';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS current_year   integer;

-- 2. Auto-generate school_code for existing schools that don't have one
UPDATE schools
SET school_code = 'SHP' || LPAD(CAST(floor(random() * 100000)::int AS text), 5, '0')
WHERE school_code IS NULL;
