CREATE TABLE IF NOT EXISTS parent_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_name TEXT,
  teacher_email TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  message TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'teacher_to_parent' CHECK (direction IN ('teacher_to_parent', 'parent_to_teacher')),
  term TEXT,
  year INTEGER,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE parent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_messages_school_isolation ON parent_messages;
CREATE POLICY parent_messages_school_isolation ON parent_messages FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pm_school_student ON parent_messages(school_id, student_id);
