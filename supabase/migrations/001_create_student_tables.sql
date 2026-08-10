-- Promotion history for bulk promote
CREATE TABLE IF NOT EXISTS promotion_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class TEXT NOT NULL,
  to_class TEXT NOT NULL,
  promoted_by UUID REFERENCES profiles(id),
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_history_school ON promotion_history(school_id);
CREATE INDEX IF NOT EXISTS idx_promotion_history_student ON promotion_history(student_id);

ALTER TABLE promotion_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promotion_history_school_isolation"
  ON promotion_history
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Transfer history (used by Transfers page)
CREATE TABLE IF NOT EXISTS transfer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('internal', 'external')),
  reason TEXT NOT NULL,
  from_class TEXT,
  to_class TEXT,
  transferred_by UUID REFERENCES profiles(id),
  transfer_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_history_school ON transfer_history(school_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_student ON transfer_history(student_id);

ALTER TABLE transfer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_history_school_isolation"
  ON transfer_history
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Add missing columns to students (idempotent)
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES profiles(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS medical_conditions TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS special_needs TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS day_boarding TEXT CHECK (day_boarding IN ('day', 'boarding'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_cert_number TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS sub_county TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS transport_route TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS house TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS club TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS upi_number TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardians JSONB DEFAULT '[]'::jsonb;

-- Student documents table
CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT,
  file_url TEXT,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_documents_school_isolation"
  ON student_documents
  USING (
    student_id IN (
      SELECT id FROM students WHERE school_id = (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
