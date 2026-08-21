-- Migration 069: Remove school_id IS NULL from profiles RLS (was leaking superadmin to all schools)

-- Drop and recreate profiles SELECT policy without the school_id IS NULL clause
DROP POLICY IF EXISTS profiles_select_school ON profiles;

CREATE POLICY profiles_select_school ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );
