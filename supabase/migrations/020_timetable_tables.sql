-- Timetable system tables for ShulePulse
-- subjects, teachers, classes already exist — only create new tables

-- ── Class Subject Requirements ──────────────────────────────
CREATE TABLE IF NOT EXISTS class_subject_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  lessons_per_week INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_csr_school ON class_subject_requirements(school_id);
CREATE INDEX IF NOT EXISTS idx_csr_class ON class_subject_requirements(class_id);

ALTER TABLE class_subject_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csr_school_isolation ON class_subject_requirements;
CREATE POLICY csr_school_isolation
  ON class_subject_requirements
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ── Teacher Subject Assignments ─────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subject_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_tsa_school ON teacher_subject_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_tsa_teacher ON teacher_subject_assignments(teacher_id);

ALTER TABLE teacher_subject_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tsa_school_isolation ON teacher_subject_assignments;
CREATE POLICY tsa_school_isolation
  ON teacher_subject_assignments
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ── Timetable Slots ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 9),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tt_school ON timetable_slots(school_id);
CREATE INDEX IF NOT EXISTS idx_tt_class ON timetable_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_tt_teacher ON timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tt_day_period ON timetable_slots(day, period);

ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_school_isolation ON timetable_slots;
CREATE POLICY tt_school_isolation
  ON timetable_slots
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
