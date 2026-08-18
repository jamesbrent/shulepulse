-- Migration 063: non_teaching_staff table
-- Provides a dedicated table for non-teaching staff (bursars, cleaners, drivers, security, etc.)
-- Separate from teachers table which is for teaching staff only.

CREATE TABLE IF NOT EXISTS non_teaching_staff (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  employee_number TEXT,
  job_title    TEXT,
  department   TEXT,
  email        TEXT,
  phone        TEXT,
  gender       TEXT,
  date_of_birth DATE,
  date_of_hire DATE,
  salary       NUMERIC,
  employment_type TEXT DEFAULT 'permanent',
  status       TEXT DEFAULT 'active',
  qualification TEXT,
  photo_url    TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS: school-level access
ALTER TABLE non_teaching_staff ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff see own school non_teaching_staff' AND tablename = 'non_teaching_staff') THEN
    CREATE POLICY "Staff see own school non_teaching_staff"
      ON non_teaching_staff FOR ALL
      USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_nts_school ON non_teaching_staff(school_id);
CREATE INDEX IF NOT EXISTS idx_nts_status ON non_teaching_staff(school_id, status);
