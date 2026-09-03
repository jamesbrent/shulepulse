-- T2-6: Let a student read their own approved/published grades.
--
-- Current `grades` RLS (096): grades_staff_all (staff CRUD) + grades_parent_read
-- (parents via students.parent_email). There is no policy allowing a 'student'
-- role to read their own results. The student portal already queries grades by
-- student_id filtered to approved/published, so add a strictly-scoped SELECT
-- policy keyed on the student's own record.
--
-- Scoped to the caller's own student row (by email, matching students.email) so
-- a student cannot read other learners' grades.

DROP POLICY IF EXISTS grades_student_read ON grades;
CREATE POLICY grades_student_read
  ON grades FOR SELECT
  USING (
    status IN ('approved', 'published')
    AND student_id = (
      SELECT id FROM students
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
