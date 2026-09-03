-- ============================================================================
-- 137_attendance_conflicts_school_id.sql
-- SECURITY (T2-3 defense-in-depth): expose school_id on attendance_conflicts.
--
-- The attendance_conflicts view (migration 110) is queried by the app's
-- AttendanceConflictsPanel with only a date/class filter and NO school_id
-- filter, relying purely on RLS (view runs security_invoker=true). This adds
-- school_id to the view's projection so the app layer can also filter by it,
-- giving the same two-layer (RLS + app filter) defense used across the rest
-- of the app.
--
-- NOTE on column ordering: CREATE OR REPLACE VIEW may only APPEND new output
-- columns at the end (Postgres cannot rename/insert existing view columns),
-- so school_id is appended as the LAST column. The existing 10 columns and
-- their order from migration 110 are preserved.
-- ============================================================================

CREATE OR REPLACE VIEW public.attendance_conflicts AS
SELECT 
  a.student_id,
  a.date,
  a.status AS daily_status,
  la.status AS lesson_status,
  la.subject_id,
  la.period_start,
  la.teacher_id,
  s.full_name AS student_name,
  s.admission_number,
  s.class AS class_name,
  a.school_id
FROM public.attendance a
JOIN public.lesson_attendance la 
  ON la.student_id = a.student_id 
  AND la.period_start::date = a.date
JOIN public.students s ON s.id = a.student_id
WHERE a.status = 'present' 
  AND la.status IN ('absent','late')
  AND a.school_id = la.school_id;
