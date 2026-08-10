-- First, add missing columns to fee_payments if not present
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS term text DEFAULT '';
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS year integer DEFAULT 0;

-- Create fee_categories
CREATE TABLE IF NOT EXISTS public.fee_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  mandatory boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create fee_structures
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.fee_categories(id) ON DELETE CASCADE,
  class text NOT NULL,
  term text NOT NULL,
  year integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  mandatory boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create fee_assessments
CREATE TABLE IF NOT EXISTS public.fee_assessments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id uuid NOT NULL REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  term text NOT NULL,
  year integer NOT NULL,
  amount_due numeric(12,2) NOT NULL,
  amount_paid numeric(12,2) DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid')),
  created_at timestamptz DEFAULT now()
);

-- Create student_ledger
CREATE TABLE IF NOT EXISTS public.student_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('charge','payment','discount','scholarship','waiver','penalty')),
  amount numeric(12,2) NOT NULL,
  term text NOT NULL,
  year integer NOT NULL,
  description text DEFAULT '',
  reference_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Create receipts
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payment_id uuid,
  total_amount numeric(12,2) NOT NULL,
  term text NOT NULL,
  year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create fee_adjustments
CREATE TABLE IF NOT EXISTS public.fee_adjustments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('discount','scholarship','waiver','penalty')),
  amount numeric(12,2) NOT NULL,
  reason text DEFAULT '',
  approved_by uuid,
  term text NOT NULL,
  year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fee_categories_school ON public.fee_categories(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_school_term_year ON public.fee_structures(school_id, term, year);
CREATE INDEX IF NOT EXISTS idx_fee_assessments_student_term_year ON public.fee_assessments(student_id, term, year);
CREATE INDEX IF NOT EXISTS idx_student_ledger_student_term_year ON public.student_ledger(student_id, term, year);
CREATE INDEX IF NOT EXISTS idx_student_ledger_school_term_year ON public.student_ledger(school_id, term, year);

-- RLS
ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_adjustments ENABLE ROW LEVEL SECURITY;

-- Create a single RLS policy per table (bypasses the "already exists" issue)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fee_categories' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.fee_categories
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fee_structures' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.fee_structures
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fee_assessments' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.fee_assessments
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_ledger' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.student_ledger
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='receipts' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.receipts
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fee_adjustments' AND policyname='school_isolation') THEN
    CREATE POLICY school_isolation ON public.fee_adjustments
      USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;
