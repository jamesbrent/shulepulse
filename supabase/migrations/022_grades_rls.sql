-- ============================================================
-- Migration 022: Grades RLS — parent read-only + staff isolation
-- ============================================================

-- 1. Enable RLS on grades (idempotent)
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing overly-permissive policies if any
DROP POLICY IF EXISTS "grades_school_isolation" ON grades;
DROP POLICY IF EXISTS "grades_parent_read" ON grades;
DROP POLICY IF EXISTS "grades_staff_all" ON grades;

-- 3. Staff (admin, teacher, hod, deputy_admin, class_teacher): full CRUD on own school
CREATE POLICY "grades_staff_all"
  ON grades FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'teacher', 'hod', 'deputy_admin', 'class_teacher', 'superadmin')
  );

-- 4. Parents: read-only on approved/published grades for their children
CREATE POLICY "grades_parent_read"
  ON grades FOR SELECT
  USING (
    status IN ('approved', 'published')
    AND school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND student_id IN (
      SELECT s.id FROM students s
      WHERE s.parent_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND s.school_id = grades.school_id
    )
  );
