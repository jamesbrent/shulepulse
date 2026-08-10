-- ─────────────────────────────────────────────────────────────────────────────
-- User management: add disabled column for lock/unlock
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS disabled boolean DEFAULT false;

-- Superadmin can update any profile (for toggling disabled status)
DROP POLICY IF EXISTS "profiles_update_superadmin" ON profiles;
CREATE POLICY "profiles_update_superadmin" ON profiles
  FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );
