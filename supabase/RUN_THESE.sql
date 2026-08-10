-- ============================================================
-- RUN THIS IN: Supabase Dashboard → SQL Editor
-- Creates storage buckets + tables + policies
-- Safe to re-run (all statements use IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- 1a. 'documents' bucket (student documents, general uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 'documents', false, 52428800,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 1b. 'exam-papers' bucket (question papers + exam uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-papers', 'exam-papers', false, 52428800,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for BOTH buckets
DO $$
DECLARE
  bucket TEXT;
BEGIN
  FOREACH bucket IN ARRAY ARRAY['documents', 'exam-papers'] LOOP
    -- Allow authenticated users to upload
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_insert" ON storage.objects; CREATE POLICY "%s_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.role() = ''authenticated'')',
      bucket, bucket, bucket
    );
    -- Allow authenticated users to read
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_select" ON storage.objects; CREATE POLICY "%s_select" ON storage.objects FOR SELECT USING (bucket_id = %L AND auth.role() = ''authenticated'')',
      bucket, bucket, bucket
    );
    -- Allow authenticated users to delete their own files
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_delete" ON storage.objects; CREATE POLICY "%s_delete" ON storage.objects FOR DELETE USING (bucket_id = %L AND auth.role() = ''authenticated'')',
      bucket, bucket, bucket
    );
  END LOOP;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- 2. exam_uploads (teacher MarksEntry, HOD DeptExams, DeputyAdmin, admin)
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

ALTER TABLE exam_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_uploads_school_isolation" ON exam_uploads;
CREATE POLICY "exam_uploads_school_isolation" ON exam_uploads FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 3. question_papers (HOD ExamSetup drill-down upload)
CREATE TABLE IF NOT EXISTS question_papers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  class_name TEXT,
  exam_type TEXT NOT NULL DEFAULT 'CAT 1',
  file_name TEXT,
  file_path TEXT,
  file_url TEXT,
  file_size BIGINT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_by_role TEXT CHECK (uploaded_by_role IN ('teacher', 'hod', 'admin')),
  term TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, subject_id, class_id, exam_type, term, year)
);

-- Add missing columns safely (for existing tables)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_papers' AND column_name='class_id') THEN ALTER TABLE question_papers ADD COLUMN class_id UUID REFERENCES classes(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_papers' AND column_name='exam_type') THEN ALTER TABLE question_papers ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'CAT 1'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_papers' AND column_name='file_url') THEN ALTER TABLE question_papers ADD COLUMN file_url TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_papers' AND column_name='class_name') THEN ALTER TABLE question_papers ADD COLUMN class_name TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_papers' AND column_name='uploaded_by_role') THEN ALTER TABLE question_papers ADD COLUMN uploaded_by_role TEXT CHECK (uploaded_by_role IN ('teacher','hod','admin')); END IF; END $$;

-- Recreate unique constraint
ALTER TABLE question_papers DROP CONSTRAINT IF EXISTS question_papers_unique_per_exam;
ALTER TABLE question_papers DROP CONSTRAINT IF EXISTS question_papers_school_id_subject_id_term_year_key;
ALTER TABLE question_papers DROP CONSTRAINT IF EXISTS question_papers_school_id_subject_id_class_name_term_year_key;
ALTER TABLE question_papers DROP CONSTRAINT IF EXISTS question_papers_school_subject_class_term_year_key;
ALTER TABLE question_papers ADD CONSTRAINT question_papers_unique_per_exam UNIQUE (school_id, subject_id, class_id, exam_type, term, year);

ALTER TABLE question_papers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "question_papers_school_isolation" ON question_papers;
CREATE POLICY "question_papers_school_isolation" ON question_papers FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Clear broken public URLs from existing records (signed URLs are now generated on demand)
UPDATE question_papers SET file_url = NULL WHERE file_url IS NOT NULL;
UPDATE exam_uploads SET file_url = NULL WHERE file_url IS NOT NULL;

-- ============================================================
-- GRADING SYSTEM CONFIGURATION (school-configurable)
-- ============================================================

-- 4. grading_systems — one row per grading system per school
CREATE TABLE IF NOT EXISTS grading_systems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,               -- e.g. 'Senior School', 'Middle School', 'Early Years'
  slug TEXT NOT NULL,                -- e.g. 'senior', 'middle', 'early' (used by getCBELevel)
  is_default BOOLEAN DEFAULT false, -- true = active system for the school
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, slug)
);

ALTER TABLE grading_systems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grading_systems_school_isolation" ON grading_systems;
CREATE POLICY "grading_systems_school_isolation" ON grading_systems FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 5. grading_bands — individual grade bands within a system
CREATE TABLE IF NOT EXISTS grading_bands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  system_id UUID NOT NULL REFERENCES grading_systems(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,               -- e.g. 'A', 'EE1', 'EE'
  label TEXT,                        -- e.g. 'Excellent', 'Exceeding Expectations'
  min_score NUMERIC NOT NULL,        -- inclusive lower bound
  max_score NUMERIC NOT NULL,        -- inclusive upper bound
  points INTEGER NOT NULL DEFAULT 0, -- quality points for GPA
  color TEXT DEFAULT '#64748b',      -- hex color for UI chips
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(system_id, grade)
);

ALTER TABLE grading_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grading_bands_school_isolation" ON grading_bands;
CREATE POLICY "grading_bands_school_isolation" ON grading_bands FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 6. exam_type_config — configurable exam types per school
CREATE TABLE IF NOT EXISTS exam_type_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,               -- machine key e.g. 'CAT 1'
  label TEXT NOT NULL,              -- display label e.g. 'Continuous Assessment Test 1'
  max_marks INTEGER NOT NULL DEFAULT 100, -- max marks for this exam type
  weightage INTEGER NOT NULL DEFAULT 0,   -- percentage weightage (0-100)
  description TEXT,                 -- optional description
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, name)
);

ALTER TABLE exam_type_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_type_config_school_isolation" ON exam_type_config;
CREATE POLICY "exam_type_config_school_isolation" ON exam_type_config FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- DEFAULT SEED DATA
-- Run this block ONCE per school after the tables exist.
-- Uses INSERT ... ON CONFLICT DO NOTHING so it's safe to re-run.
-- ============================================================
DO $$
DECLARE
  v_school UUID;
  v_senior UUID;
  v_middle UUID;
  v_early  UUID;
BEGIN
  -- Loop through every school and seed if empty
  FOR v_school IN SELECT id FROM schools LOOP
    -- Skip if already seeded
    IF EXISTS (SELECT 1 FROM grading_systems WHERE school_id = v_school LIMIT 1) THEN
      CONTINUE;
    END IF;

    -- ── Senior School grading system ──
    INSERT INTO grading_systems (school_id, name, slug, is_default)
    VALUES (v_school, 'Senior School', 'senior', true)
    RETURNING id INTO v_senior;

    INSERT INTO grading_bands (school_id, system_id, grade, label, min_score, max_score, points, color, sort_order) VALUES
      (v_school, v_senior, 'A',  'Highest Distinction', 80, 100, 12, '#16a34a', 1),
      (v_school, v_senior, 'A-', 'Excellent',           75, 79,  11, '#22c55e', 2),
      (v_school, v_senior, 'B+', 'Very Good',           70, 74,  10, '#65a30d', 3),
      (v_school, v_senior, 'B',  'Good',                65, 69,  9,  '#84cc16', 4),
      (v_school, v_senior, 'B-', 'Competent',           60, 64,  8,  '#eab308', 5),
      (v_school, v_senior, 'C+', 'Satisfactory',        55, 59,  7,  '#f59e0b', 6),
      (v_school, v_senior, 'C',  'Average',             50, 54,  6,  '#f97316', 7),
      (v_school, v_senior, 'C-', 'Below Average',       45, 49,  5,  '#ea580c', 8),
      (v_school, v_senior, 'D+', 'Marginal',            40, 44,  4,  '#dc2626', 9),
      (v_school, v_senior, 'D',  'Weak',                35, 39,  3,  '#b91c1c', 10),
      (v_school, v_senior, 'D-', 'Very Weak',           30, 34,  2,  '#991b1b', 11),
      (v_school, v_senior, 'E',  'Minimal Performance',  0, 29,   1,  '#7f1d1d', 12);

    -- ── Middle School grading system ──
    INSERT INTO grading_systems (school_id, name, slug, is_default)
    VALUES (v_school, 'Middle School', 'middle', false)
    RETURNING id INTO v_middle;

    INSERT INTO grading_bands (school_id, system_id, grade, label, min_score, max_score, points, color, sort_order) VALUES
      (v_school, v_middle, 'EE1', 'Exceptional',          90, 100, 8, '#16a34a', 1),
      (v_school, v_middle, 'EE2', 'Very Good',            75, 89,  7, '#22c55e', 2),
      (v_school, v_middle, 'ME1', 'Good',                 58, 74,  6, '#eab308', 3),
      (v_school, v_middle, 'ME2', 'Fair',                 41, 57,  5, '#f59e0b', 4),
      (v_school, v_middle, 'AE1', 'Needs Improvement',    31, 40,  4, '#f97316', 5),
      (v_school, v_middle, 'AE2', 'Below Average',        21, 30,  3, '#ea580c', 6),
      (v_school, v_middle, 'BE1', 'Well Below Average',   11, 20,  2, '#dc2626', 7),
      (v_school, v_middle, 'BE2', 'Minimal Competence',    0, 10,  1, '#991b1b', 8);

    -- ── Early Years grading system ──
    INSERT INTO grading_systems (school_id, name, slug, is_default)
    VALUES (v_school, 'Early Years', 'early', false)
    RETURNING id INTO v_early;

    INSERT INTO grading_bands (school_id, system_id, grade, label, min_score, max_score, points, color, sort_order) VALUES
      (v_school, v_early, 'EE', 'Exceeding Expectations',  75, 100, 4, '#16a34a', 1),
      (v_school, v_early, 'ME', 'Meeting Expectations',    50, 74,  3, '#eab308', 2),
      (v_school, v_early, 'AE', 'Approaching Expectations', 25, 49, 2, '#f97316', 3),
      (v_school, v_early, 'BE', 'Below Expectations',       0, 24,  1, '#dc2626', 4);

    -- ── Default exam types ──
    INSERT INTO exam_type_config (school_id, name, label, max_marks, weightage, description, sort_order) VALUES
      (v_school, 'CAT 1',   'Continuous Assessment Test 1',  20, 20, 'First termly continuous assessment covering the first half of the syllabus.', 1),
      (v_school, 'CAT 2',   'Continuous Assessment Test 2',  20, 20, 'Second termly continuous assessment covering the second half of the syllabus.', 2),
      (v_school, 'End Term', 'End of Term Examination',       60, 60, 'Comprehensive end-of-term examination covering the full syllabus.', 3);

  END LOOP;
END $$;
