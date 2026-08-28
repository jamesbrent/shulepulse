-- ============================================================================
-- 112_lesson_attendance_class_teacher.sql
-- Class teachers also teach subjects and should be able to mark lesson
-- attendance for their classes on the Pro plan. Add class_teacher to the
-- write role list on lesson_attendance. Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "lesson_attendance_teacher_write" ON public.lesson_attendance;

CREATE POLICY "lesson_attendance_teacher_write" ON public.lesson_attendance
  FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('students.attendance.lesson')
      AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','teacher','class_teacher'])
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('students.attendance.lesson')
      AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','teacher','class_teacher'])
    )
  );

NOTIFY pgrst, 'reload schema';