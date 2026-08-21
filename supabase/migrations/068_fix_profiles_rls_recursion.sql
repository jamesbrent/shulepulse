-- Migration 068: Fix infinite recursion in profiles RLS
-- The problem: profiles policies subquery the profiles table itself,
-- causing PostgreSQL to re-evaluate the policy recursively.
-- The fix: use a SECURITY DEFINER function that bypasses RLS.

-- Helper function that returns current user's school_id without triggering RLS
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid()
$$;

-- Helper function that returns current user's role without triggering RLS
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ═══ Drop the broken policies ═══
DROP POLICY IF EXISTS profiles_select_school ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
DROP POLICY IF EXISTS profiles_superadmin_all ON profiles;

-- ═══ Recreate with security definer functions ═══

-- SELECT: own row + same school + superadmin sees all + NULL school_id allowed
CREATE POLICY profiles_select_school ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
    OR school_id IS NULL
  );

-- UPDATE: own row only
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Superadmin full access
CREATE POLICY profiles_superadmin_all ON profiles
  FOR ALL USING (get_my_role() = 'superadmin');

-- ═══ Also fix teachers policies (they reference profiles too) ═══
DROP POLICY IF EXISTS teachers_select_school ON teachers;
DROP POLICY IF EXISTS teachers_insert_school ON teachers;
DROP POLICY IF EXISTS teachers_update_school ON teachers;
DROP POLICY IF EXISTS teachers_delete_school ON teachers;

CREATE POLICY teachers_select_school ON teachers
  FOR SELECT USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY teachers_insert_school ON teachers
  FOR INSERT WITH CHECK (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY teachers_update_school ON teachers
  FOR UPDATE USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

CREATE POLICY teachers_delete_school ON teachers
  FOR DELETE USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );
