-- ============================================================
-- Migration 027: CBC Assessments RLS — staff write access
-- ============================================================

-- 1. Enable RLS on cbc_assessments (idempotent)
ALTER TABLE cbc_assessments ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing overly-permissive policies if any
DROP POLICY IF EXISTS "cbc_assessments_staff_all" ON cbc_assessments;
DROP POLICY IF EXISTS "cbc_assessments_parent_read" ON cbc_assessments;

-- 3. Staff (admin, teacher, hod, deputy_admin, class_teacher): full CRUD on own school
CREATE POLICY "cbc_assessments_staff_all"
  ON cbc_assessments FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'teacher', 'hod', 'deputy_admin', 'class_teacher', 'superadmin')
  );

-- 4. Parents: read-only on their own children's assessments
CREATE POLICY "cbc_assessments_parent_read"
  ON cbc_assessments FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND student_id IN (
      SELECT s.id FROM students s
      WHERE s.parent_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND s.school_id = cbc_assessments.school_id
    )
  );
