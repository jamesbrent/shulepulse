-- ─────────────────────────────────────────────────────────────────────────────
-- Schools RLS policies + missing columns
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. Ensure columns exist
ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan              text DEFAULT 'basic';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status            text DEFAULT 'active';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS county            text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS type              text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS address           text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone             text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email             text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS primary_color     text DEFAULT '#2563eb';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS secondary_color   text DEFAULT '#16a34a';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url          text;

-- 1. Enable RLS
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "schools_insert_superadmin" ON schools;
DROP POLICY IF EXISTS "schools_select_all" ON schools;
DROP POLICY IF EXISTS "schools_update_all" ON schools;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON schools;
DROP POLICY IF EXISTS "Enable select for users based on school_id" ON schools;

-- 3. Any authenticated user can insert (superadmin flow)
CREATE POLICY "schools_insert_superadmin" ON schools
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 4. Read: own school or superadmin reads all
CREATE POLICY "schools_select_all" ON schools
  FOR SELECT
  USING (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- 5. Update: own school or superadmin updates any
CREATE POLICY "schools_update_all" ON schools
  FOR UPDATE
  USING (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );
