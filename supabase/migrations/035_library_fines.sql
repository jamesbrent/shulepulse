-- ─────────────────────────────────────────────────────────────────────────────
-- Library Fines — paid in cash (with transaction code) or debited from fees
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS library_fines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES library_members(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES library_loans(id) ON DELETE SET NULL,
  book_id UUID REFERENCES library_books(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'overdue',
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','waived')),
  payment_method TEXT,
  transaction_code TEXT,
  debited_from_fees BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_fines_school ON library_fines(school_id);
CREATE INDEX IF NOT EXISTS idx_library_fines_member ON library_fines(member_id);
CREATE INDEX IF NOT EXISTS idx_library_fines_loan ON library_fines(loan_id);

ALTER TABLE library_fines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_fines_school" ON library_fines;
CREATE POLICY "library_fines_school" ON library_fines FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
