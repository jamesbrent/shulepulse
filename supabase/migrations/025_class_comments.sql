CREATE TABLE IF NOT EXISTS class_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  teacher_name TEXT,
  subject TEXT DEFAULT 'General',
  comment TEXT NOT NULL,
  term TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE class_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_comments_school_isolation ON class_comments;
CREATE POLICY class_comments_school_isolation ON class_comments FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_cc_school_class ON class_comments(school_id, class_name);
