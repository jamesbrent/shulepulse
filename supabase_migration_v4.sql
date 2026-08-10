-- ─── Notices Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES schools(id) NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notices_school ON notices(school_id);
CREATE INDEX IF NOT EXISTS idx_notices_created ON notices(created_at DESC);

-- RLS: school isolation (read own school's notices)
CREATE POLICY notices_school_isolation ON notices
  FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- RLS: authenticated users can insert
CREATE POLICY notices_insert ON notices
  FOR INSERT
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ─── Attendance Indexes (for performance) ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date ON attendance(teacher_id, date);
