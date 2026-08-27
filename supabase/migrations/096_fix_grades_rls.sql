-- ============================================================
-- Migration 096: Fix 403 on grade upserts (marks entry submit)
-- ------------------------------------------------------------
-- Symptom: POST /rest/v1/grades -> 403 Forbidden when a teacher
-- clicks "Submit for Approval" (and the same for "Save Draft").
-- Result: no grades rows ever written -> Mark Approval / Entry
-- Tracking empty, Settings Academic Calendar term/year dropdowns
-- empty (they are built from existing grades rows).
--
-- Two root-cause repairs:
--   1. GRANT table privileges to `authenticated`/`service_role`.
--      RLS policies only FILTER within granted privileges; when a
--      table was created outside the dashboard without default
--      grants, PostgREST returns 403 regardless of policies.
--   2. Recreate the grades staff policy so it also has an explicit
--      WITH CHECK (required for INSERT/upsert) and includes the
--      real role values used by the app ('teacher', ...).
-- ============================================================

-- 1. Explicit table grants (idempotent)
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO authenticated;
GRANT ALL ON grades TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON grade_audit_logs TO authenticated;
GRANT ALL ON grade_audit_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON exam_uploads TO authenticated;
GRANT ALL ON exam_uploads TO service_role;

-- 2. Robust grades staff policy (supersedes 022 / 084 versions)
DROP POLICY IF EXISTS grades_staff_all ON grades;
CREATE POLICY grades_staff_all
  ON grades FOR ALL
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND get_my_role() IN (
        'admin',
        'teacher',
        'hod',
        'deputy_admin',
        'deputy_administrator',
        'class_teacher',
        'bursar',
        'registrar',
        'reception'
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND get_my_role() IN (
        'admin',
        'teacher',
        'hod',
        'deputy_admin',
        'deputy_administrator',
        'class_teacher',
        'bursar',
        'registrar',
        'reception'
      )
    )
  );

-- 3. Sanity check: run this AFTER applying to confirm visibility
-- SELECT * FROM pg_policies WHERE tablename IN ('grades', 'grade_audit_logs', 'exam_uploads');
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('grades', 'grade_audit_logs', 'exam_uploads') AND grantee IN ('authenticated', 'service_role');