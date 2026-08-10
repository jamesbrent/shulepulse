-- ============================================================
-- Migration 028: Fix Notices Schema + Staff Creation RLS
-- ============================================================

-- 1. Add missing columns (idempotent)
ALTER TABLE notices ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
ALTER TABLE notices ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'
  CHECK (category IN ('general', 'urgent', 'event', 'academic', 'message', 'other'));
ALTER TABLE notices ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all'
  CHECK (target_audience IN ('all', 'teachers', 'parents', 'students', 'staff'));

-- 2. Drop overly-permissive old policies
DROP POLICY IF EXISTS notices_school_isolation ON notices;
DROP POLICY IF EXISTS notices_insert ON notices;

-- 3. Staff (admin, teacher, hod, deputy_admin, class_teacher, superadmin): full access to own school
CREATE POLICY "notices_staff_all"
  ON notices FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'teacher', 'hod', 'deputy_admin', 'class_teacher', 'superadmin')
  );

-- 4. Parents: read-only on notices for their school
CREATE POLICY "notices_parent_read"
  ON notices FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'parent'
  );

-- 5. Students: read-only on notices for their school
CREATE POLICY "notices_student_read"
  ON notices FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'student'
  );
