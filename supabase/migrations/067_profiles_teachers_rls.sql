-- Migration 067: Enable RLS on profiles + teachers with school-scoping policies
-- This ensures admins can only see staff from their own school.
-- Safe: uses IF NOT EXISTS checks, won't break existing access.

-- ═══ PROFILES ═══
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read profiles in their own school (or superadmin reads all)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_school' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY profiles_select_school ON profiles
      FOR SELECT USING (
        school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
        OR school_id IS NULL
      );
  END IF;
END $$;

-- Allow users to update their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_own' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY profiles_update_own ON profiles
      FOR UPDATE USING (id = auth.uid());
  END IF;
END $$;

-- Allow superadmin full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_superadmin_all' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY profiles_superadmin_all ON profiles
      FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin');
  END IF;
END $$;

-- ═══ TEACHERS ═══
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teachers_select_school' AND tablename = 'teachers'
  ) THEN
    CREATE POLICY teachers_select_school ON teachers
      FOR SELECT USING (
        school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teachers_insert_school' AND tablename = 'teachers'
  ) THEN
    CREATE POLICY teachers_insert_school ON teachers
      FOR INSERT WITH CHECK (
        school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teachers_update_school' AND tablename = 'teachers'
  ) THEN
    CREATE POLICY teachers_update_school ON teachers
      FOR UPDATE USING (
        school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teachers_delete_school' AND tablename = 'teachers'
  ) THEN
    CREATE POLICY teachers_delete_school ON teachers
      FOR DELETE USING (
        school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
      );
  END IF;
END $$;
