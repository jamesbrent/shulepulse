-- Migration 093: Add delete policy for schools (needed for onboarding rollback)

-- Drop existing if any
DROP POLICY IF EXISTS "schools_delete_superadmin" ON schools;

-- Superadmin can delete any school (used during onboarding rollback)
CREATE POLICY "schools_delete_superadmin" ON schools
  FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
  );
