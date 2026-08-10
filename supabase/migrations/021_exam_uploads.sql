-- ============================================================
-- Migration 021: Exam Uploads — file tracking for exam papers
-- ============================================================

-- 1. Create exam_uploads table
CREATE TABLE IF NOT EXISTS exam_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  class_name TEXT,
  term TEXT NOT NULL,
  year INTEGER NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT CHECK (file_type IN ('pdf', 'docx', 'doc')),
  file_size BIGINT,
  storage_path TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_by_role TEXT CHECK (uploaded_by_role IN ('teacher', 'hod', 'admin')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, subject, exam_type, class_name, term, year)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_exam_uploads_school ON exam_uploads(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_uploads_term ON exam_uploads(term, year);
CREATE INDEX IF NOT EXISTS idx_exam_uploads_status ON exam_uploads(status);
CREATE INDEX IF NOT EXISTS idx_exam_uploads_subject ON exam_uploads(subject);

-- 3. Enable RLS
ALTER TABLE exam_uploads ENABLE ROW LEVEL SECURITY;

-- 4. RLS: school isolation (all authenticated users see only their school)
DROP POLICY IF EXISTS "exam_uploads_school_isolation" ON exam_uploads;
CREATE POLICY "exam_uploads_school_isolation"
  ON exam_uploads FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 5. Storage: exam uploads use the existing 'documents' bucket
--    Files are stored under {school_id}/exam_uploads/ subfolder
--    No separate bucket needed — documents bucket already has RLS policies

-- 6. updated_at trigger
CREATE OR REPLACE FUNCTION update_exam_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS exam_uploads_updated_at ON exam_uploads;
CREATE TRIGGER exam_uploads_updated_at
  BEFORE UPDATE ON exam_uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_exam_uploads_updated_at();
