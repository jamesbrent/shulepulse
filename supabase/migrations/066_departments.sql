-- Migration 066: Departments table
-- Replaces hardcoded department arrays with a proper lookup table

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'academic' CHECK (category IN ('academic', 'support')),
  head_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, name)
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'departments_same_school' AND tablename = 'departments'
  ) THEN
    CREATE POLICY departments_same_school ON departments
      FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_depts_school ON departments(school_id);

-- Seed from existing teacher departments (academic)
INSERT INTO departments (school_id, name, category)
SELECT DISTINCT t.school_id, unnest(t.departments), 'academic'
FROM teachers t
WHERE array_length(t.departments, 1) > 0
ON CONFLICT (school_id, name) DO NOTHING;

-- Seed from existing non_teaching_staff departments (support)
INSERT INTO departments (school_id, name, category)
SELECT DISTINCT n.school_id, n.department, 'support'
FROM non_teaching_staff n
WHERE n.department IS NOT NULL AND n.department != ''
ON CONFLICT (school_id, name) DO NOTHING;
