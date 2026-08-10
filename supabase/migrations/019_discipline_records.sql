-- Create the discipline_records table
CREATE TABLE IF NOT EXISTS discipline_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  offense TEXT NOT NULL,
  description TEXT,
  action_taken TEXT,
  date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'escalated')),
  reported_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discipline_records_school ON discipline_records(school_id);
CREATE INDEX IF NOT EXISTS idx_discipline_records_student ON discipline_records(student_id);
CREATE INDEX IF NOT EXISTS idx_discipline_records_status ON discipline_records(status);
CREATE INDEX IF NOT EXISTS idx_discipline_records_date ON discipline_records(date DESC);

-- Row Level Security
ALTER TABLE discipline_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discipline_records_school_isolation ON discipline_records;
CREATE POLICY discipline_records_school_isolation
  ON discipline_records
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- The code also reads these legacy column names as fallbacks (|| check):
--   offence (→ offense), action (→ action_taken),
--   details (→ description), teacher_name (→ reported_by)
-- No migration needed — the JS code handles both spellings.
