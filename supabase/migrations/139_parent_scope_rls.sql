-- T2-5: Role-gated students RLS + parent-scoped reads for attendance & fees.
--
-- Context (audit X4): `parent_student_links` is referenced by 074 only inside an
-- `IF EXISTS` guard and is NEVER created by any migration, so it does not exist.
-- The real parent->student linking mechanism used by the app is
-- `students.parent_id` (ParentPortal.jsx fetches children via
--   .from('students').select('*').eq('parent_id', user.id)) and
-- `students.parent_email` (used by grades/cbc parent-read policies).
--
-- Today `students`, `attendance`, `fee_assessments`, `fee_payments`,
-- `student_ledger` are gated only by school_id OR superadmin. A parent role
-- therefore cannot read their own children's records, or worse can read the
-- whole school if their profile carries the school_id. We add strictly-scoped
-- SELECT policies so:
--   - a 'parent' can read their OWN children (parent_id = auth.uid()) and those
--     children's attendance/fee rows (student_id of own child);
--   - a 'student' can read their OWN student record (email match).
-- Staff/school isolation policies remain untouched (OR semantics on SELECT).

-- ---- students: parent reads own children ----
DROP POLICY IF EXISTS students_parent_read ON students;
CREATE POLICY students_parent_read
  ON students FOR SELECT
  USING (parent_id = auth.uid());

-- ---- students: student reads own record ----
DROP POLICY IF EXISTS students_self_read ON students;
CREATE POLICY students_self_read
  ON students FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ---- attendance: parent reads own children's rows ----
DROP POLICY IF EXISTS attendance_parent_read ON attendance;
CREATE POLICY attendance_parent_read
  ON attendance FOR SELECT
  USING (
    student_id IN (SELECT id FROM students WHERE parent_id = auth.uid())
  );

-- ---- fee_assessments: parent reads own children's rows ----
DROP POLICY IF EXISTS fee_assessments_parent_read ON fee_assessments;
CREATE POLICY fee_assessments_parent_read
  ON fee_assessments FOR SELECT
  USING (
    student_id IN (SELECT id FROM students WHERE parent_id = auth.uid())
  );

-- ---- fee_payments: parent reads own children's rows ----
DROP POLICY IF EXISTS fee_payments_parent_read ON fee_payments;
CREATE POLICY fee_payments_parent_read
  ON fee_payments FOR SELECT
  USING (
    student_id IN (SELECT id FROM students WHERE parent_id = auth.uid())
  );

-- ---- student_ledger: parent reads own children's rows ----
DROP POLICY IF EXISTS student_ledger_parent_read ON student_ledger;
CREATE POLICY student_ledger_parent_read
  ON student_ledger FOR SELECT
  USING (
    student_id IN (SELECT id FROM students WHERE parent_id = auth.uid())
  );

-- The grades table already has parent read via parent_email (022) and the
-- staff policy; no student-grade-read change belongs to this migration.
