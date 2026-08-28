-- ============================================================================
-- 110_attendance_system.sql
-- Attendance system: daily + lesson attendance, conflict detection, plan-gated features
-- ============================================================================

-- ============================ feature keys ============================
-- Split existing students.attendance into three tiered keys
INSERT INTO plan_features (plan_key, feature_key) VALUES
  ('basic',    'students.attendance.daily'),
  ('pro',      'students.attendance.daily'),
  ('enterprise','students.attendance.daily'),
  ('pro',      'students.attendance.lesson'),
  ('enterprise','students.attendance.lesson'),
  ('enterprise','students.attendance.analytics')
ON CONFLICT (plan_key, feature_key) DO NOTHING;

-- ============================ lesson_attendance table ============================
CREATE TABLE IF NOT EXISTS public.lesson_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  class_name text,  -- e.g., 'Grade 6' matches students.class
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (student_id, period_start, period_end)  -- one record per student per period
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS lesson_attendance_school_date_idx ON public.lesson_attendance (school_id, period_start);
CREATE INDEX IF NOT EXISTS lesson_attendance_student_date_idx ON public.lesson_attendance (student_id, period_start);
CREATE INDEX IF NOT EXISTS lesson_attendance_teacher_date_idx ON public.lesson_attendance (teacher_id, period_start);
CREATE INDEX IF NOT EXISTS lesson_attendance_class_date_idx ON public.lesson_attendance (class_name, period_start);

-- Enable RLS
ALTER TABLE public.lesson_attendance ENABLE ROW LEVEL SECURITY;

-- ============================ attendance_conflicts view ============================
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
  s.class AS class_name
FROM public.attendance a
JOIN public.lesson_attendance la 
  ON la.student_id = a.student_id 
  AND la.period_start::date = a.date
JOIN public.students s ON s.id = a.student_id
WHERE a.status = 'present' 
  AND la.status IN ('absent','late')
  AND a.school_id = la.school_id;

-- Run the view under the invoking user's RLS so people only see rows their
-- own table policies allow
ALTER VIEW public.attendance_conflicts SET (security_invoker = true);
REVOKE ALL ON public.attendance_conflicts FROM public;
GRANT SELECT ON public.attendance_conflicts TO authenticated;

-- ============================ RLS policies ============================

-- ===== lesson_attendance =====

-- Class Teacher: SELECT lesson attendance for their assigned classes
CREATE POLICY "lesson_attendance_class_teacher_select"
  ON public.lesson_attendance FOR SELECT TO authenticated
  USING (
    get_my_role() = 'class_teacher' 
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND class_name = ANY (p.classes_assigned))
    AND my_has_feature('students.attendance.lesson')
  );

-- Subject Teacher: CRUD their own lessons
CREATE POLICY "lesson_attendance_subject_teacher_select"
  ON public.lesson_attendance FOR SELECT TO authenticated
  USING (
    get_my_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND my_has_feature('students.attendance.lesson')
  );

CREATE POLICY "lesson_attendance_subject_teacher_insert"
  ON public.lesson_attendance FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND my_has_feature('students.attendance.lesson')
    AND school_id = get_my_school_id()
  );

CREATE POLICY "lesson_attendance_subject_teacher_update"
  ON public.lesson_attendance FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND my_has_feature('students.attendance.lesson')
  )
  WITH CHECK (
    get_my_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND my_has_feature('students.attendance.lesson')
    AND school_id = get_my_school_id()
  );

CREATE POLICY "lesson_attendance_subject_teacher_delete"
  ON public.lesson_attendance FOR DELETE TO authenticated
  USING (
    get_my_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND my_has_feature('students.attendance.lesson')
  );

-- School Admin: full access
CREATE POLICY "lesson_attendance_admin_all"
  ON public.lesson_attendance FOR ALL TO authenticated
  USING (
    (get_my_role() = 'admin' OR get_my_role() = 'superadmin')
    AND school_id = get_my_school_id()
    AND my_has_feature('students.attendance.lesson')
  )
  WITH CHECK (
    (get_my_role() = 'admin' OR get_my_role() = 'superadmin')
    AND school_id = get_my_school_id()
    AND my_has_feature('students.attendance.lesson')
  );

-- ===== attendance (daily) - reinforce existing with feature gates =====
-- Class Teacher: CRUD daily attendance for their assigned classes
DROP POLICY IF EXISTS "attendance_class_teacher_crud" ON public.attendance;
CREATE POLICY "attendance_class_teacher_crud"
  ON public.attendance FOR ALL TO authenticated
  USING (
    get_my_role() IN ('class_teacher','admin','superadmin')
    AND (
      (get_my_role() = 'class_teacher' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND class_name = ANY (p.classes_assigned)))
      OR get_my_role() IN ('admin','superadmin')
    )
    AND my_has_feature('students.attendance.daily')
  )
  WITH CHECK (
    get_my_role() IN ('class_teacher','admin','superadmin')
    AND (
      (get_my_role() = 'class_teacher' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND class_name = ANY (p.classes_assigned)))
      OR get_my_role() IN ('admin','superadmin')
    )
    AND my_has_feature('students.attendance.daily')
    AND school_id = get_my_school_id()
  );

-- Subject Teacher: read daily attendance for context
CREATE POLICY "attendance_subject_teacher_select"
  ON public.attendance FOR SELECT TO authenticated
  USING (
    get_my_role() = 'teacher'
    AND my_has_feature('students.attendance.daily')
  );

-- Admin: full access
CREATE POLICY "attendance_admin_all"
  ON public.attendance FOR ALL TO authenticated
  USING (
    get_my_role() IN ('admin','superadmin')
    AND school_id = get_my_school_id()
    AND my_has_feature('students.attendance.daily')
  )
  WITH CHECK (
    get_my_role() IN ('admin','superadmin')
    AND school_id = get_my_school_id()
    AND my_has_feature('students.attendance.daily')
  );

-- ===== attendance_conflicts view =====
-- Read access governed by security_invoker + underlying table RLS policies

NOTIFY pgrst, 'reload schema';