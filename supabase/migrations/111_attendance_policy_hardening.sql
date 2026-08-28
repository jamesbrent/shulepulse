-- ============================================================================
-- 111_attendance_policy_hardening.sql
-- Replace legacy permissive public-role attendance policies with feature-gated,
-- role-aware policies consistent with the Phase 5 (C0-C7) policy pattern.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------- attendance (daily) ----------------------------
DROP POLICY IF EXISTS "attendance_isolation" ON public.attendance;
DROP POLICY IF EXISTS "attendance_school_isolation" ON public.attendance;
DROP POLICY IF EXISTS "attendance_subject_teacher_select" ON public.attendance;
DROP POLICY IF EXISTS "attendance_class_teacher_crud" ON public.attendance;
DROP POLICY IF EXISTS "attendance_admin_all" ON public.attendance;
DROP POLICY IF EXISTS "attendance_select_gated" ON public.attendance;
DROP POLICY IF EXISTS "attendance_write_gated" ON public.attendance;

-- SELECT: superadmin OR (own school AND daily feature). Any staff can view.
CREATE POLICY "attendance_select_gated" ON public.attendance
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.attendance.daily')));

-- WRITE: superadmin OR (own school AND daily feature AND role in
--        admin|deputy_administrator|class_teacher)
CREATE POLICY "attendance_write_gated" ON public.attendance
  FOR ALL TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('students.attendance.daily')
      AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','class_teacher'])
    )
  )
  WITH CHECK (
    get_my_role() = 'superadmin'
    OR (
      school_id = get_my_school_id()
      AND my_has_feature('students.attendance.daily')
      AND get_my_role() = ANY (ARRAY['admin','deputy_administrator','class_teacher'])
    )
  );

-- ---------------------- lesson_attendance (Pro) -----------------------------
DROP POLICY IF EXISTS "lesson_attendance_class_teacher_select" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_subject_teacher_select" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_subject_teacher_insert" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_subject_teacher_update" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_subject_teacher_delete" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_admin_all" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_select_gated" ON public.lesson_attendance;
DROP POLICY IF EXISTS "lesson_attendance_teacher_write" ON public.lesson_attendance;

-- Any staff of the school can view lesson attendance (feature: lesson)
CREATE POLICY "lesson_attendance_select_gated" ON public.lesson_attendance
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin' OR (school_id = get_my_school_id() AND my_has_feature('students.attendance.lesson')));

-- Subject teachers create/update/delete their own lesson records
-- (aligned with 112, which adds class_teacher to the write roles)
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