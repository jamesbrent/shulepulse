-- ─── Grades table: add new columns for status/workflow/approval ──────────────

-- Add columns if they don't exist (safe to re-run)
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS exam_type text DEFAULT 'End Term';
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add CHECK constraint for status (won't error if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grades_status_check'
  ) THEN
    ALTER TABLE public.grades ADD CONSTRAINT grades_status_check
      CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'locked'));
  END IF;
END $$;

-- Drop old unique constraints that don't include exam_type, then create new one
DO $$ DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cl ON con.conrelid = cl.oid
    WHERE cl.relname = 'grades'
      AND con.contype = 'u'
      AND NOT EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = 'public.grades'::regclass
          AND a.attname = 'exam_type'
          AND a.attnum = ANY (con.conkey)
      )
  LOOP
    EXECUTE 'ALTER TABLE public.grades DROP CONSTRAINT ' || rec.conname;
  END LOOP;
END $$;

-- Create new unique constraint including exam_type (if not already present)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grades_unique_student_subject_exam_term_year'
  ) THEN
    ALTER TABLE public.grades ADD CONSTRAINT grades_unique_student_subject_exam_term_year
      UNIQUE (student_id, subject, exam_type, term, year);
  END IF;
END $$;

-- Auto-update updated_at on grades
CREATE OR REPLACE FUNCTION update_grades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grades_updated_at ON public.grades;
CREATE TRIGGER grades_updated_at
  BEFORE UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION update_grades_updated_at();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_grades_status ON public.grades(status);
CREATE INDEX IF NOT EXISTS idx_grades_submitted_at ON public.grades(submitted_at);
CREATE INDEX IF NOT EXISTS idx_grades_approved_by ON public.grades(approved_by);
CREATE INDEX IF NOT EXISTS idx_grades_updated_at ON public.grades(updated_at DESC);

-- ─── grade_audit_logs table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grade_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  action text NOT NULL,
  performed_by uuid REFERENCES public.profiles(id),
  performed_at timestamptz DEFAULT now(),
  details text DEFAULT ''
);

ALTER TABLE public.grade_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_grade_audit_logs_school ON public.grade_audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_logs_performed_at ON public.grade_audit_logs(performed_at DESC);

-- RLS: school isolation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grade_audit_logs' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.grade_audit_logs
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- RLS: authenticated users can insert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grade_audit_logs' AND policyname='insert_own_school') THEN
    CREATE POLICY insert_own_school ON public.grade_audit_logs
      FOR INSERT
      WITH CHECK (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;
