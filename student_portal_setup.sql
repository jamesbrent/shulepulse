-- ════════════════════════════════════════════════════════════════════════
--  STUDENT PORTAL SETUP
--  Run this in the Supabase SQL Editor.
--  Fixes the 404/400 errors the student portal hits:
--    1. Creates the tables the portal reads that don't exist yet
--       (events, assignments, messages, library_books)
--    2. Adds RLS read policies so students can see their own grades & CBC
--    Existing tables (timetable_slots, notices, discipline_records,
--    exam_uploads, fee_*, subjects, classes, teachers) already use
--    school-isolation policies that students pass through.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. EVENTS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date DATE,
  time TEXT,
  location TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_school ON events(school_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_school_isolation ON events;
CREATE POLICY events_school_isolation
  ON events FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ────────────────────────────────────────────────────────────────
-- 2. ASSIGNMENTS
--    class_id references classes; class is the text name for
--    easy matching against the student's `class` column.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  class TEXT,
  subject TEXT DEFAULT '',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'assignment',
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_school ON assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assignments_school_isolation ON assignments;
CREATE POLICY assignments_school_isolation
  ON assignments FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ────────────────────────────────────────────────────────────────
-- 3. MESSAGES  (student inbox / outbox)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  sender_name TEXT DEFAULT '',
  recipient_id UUID REFERENCES profiles(id),
  subject TEXT DEFAULT '',
  message TEXT DEFAULT '',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_school ON messages(school_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_school_isolation ON messages;
CREATE POLICY messages_school_isolation
  ON messages FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ────────────────────────────────────────────────────────────────
-- 4. LIBRARY BOOKS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  isbn TEXT DEFAULT '',
  available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_books_school ON library_books(school_id);

ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS library_books_school_isolation ON library_books;
CREATE POLICY library_books_school_isolation
  ON library_books FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ────────────────────────────────────────────────────────────────
-- 5. GRADES — students can read their own approved/published results
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS grades_student_read ON grades;
CREATE POLICY grades_student_read
  ON grades FOR SELECT
  USING (
    status IN ('approved', 'published')
    AND student_id IN (
      SELECT id FROM students
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- ────────────────────────────────────────────────────────────────
-- 6. CBC ASSESSMENTS — students can read their own competencies
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cbc_assessments_student_read ON cbc_assessments;
CREATE POLICY cbc_assessments_student_read
  ON cbc_assessments FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
