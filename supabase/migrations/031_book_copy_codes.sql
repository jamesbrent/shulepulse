-- ════════════════════════════════════════════════════════════════════════
-- 031_BOOK_COPY_CODES
-- Each physical copy of a book gets its own unique school-generated
-- accession code (e.g. GHS/000123), even for multiple copies of the
-- same title. Adds:
--   - library_settings   : per-school code prefix + RLS
--   - library_book_copies: individual copies with codes + RLS
--   - library_loans.copy_id: which copy a loan refers to
--   - next_book_copy_codes RPC: race-safe sequential code generator
-- Backfills copies for books that existed before this migration.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Per-school settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_settings (
  school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  code_prefix TEXT NOT NULL DEFAULT 'LIB',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default prefix = first 3 letters of school name (uppercase), fallback 'LIB'
INSERT INTO library_settings (school_id, code_prefix)
SELECT id,
       COALESCE(
         NULLIF(upper(substring(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g') from 1 for 3)), ''),
         'LIB'
       )
FROM schools
ON CONFLICT (school_id) DO NOTHING;

-- ── Individual copies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_book_copies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  copy_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','borrowed','lost','damaged','withdrawn')),
  acquired_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, copy_code)
);

CREATE INDEX IF NOT EXISTS idx_book_copies_book ON library_book_copies(book_id);

-- Loan now tracks which physical copy was issued
ALTER TABLE library_loans ADD COLUMN IF NOT EXISTS copy_id UUID
  REFERENCES library_book_copies(id) ON DELETE SET NULL;

-- ── Race-safe sequential code generator ────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS library_book_copy_seq START 1;

CREATE OR REPLACE FUNCTION public.next_book_copy_codes(p_prefix TEXT, p_count INTEGER)
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p_prefix || '/' || lpad(nextval('public.library_book_copy_seq')::text, 6, '0')
  FROM generate_series(1, p_count);
END;
$$;

REVOKE ALL ON FUNCTION public.next_book_copy_codes(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_book_copy_codes(TEXT, INTEGER) TO authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE library_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_book_copies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_settings_school" ON library_settings;
CREATE POLICY "library_settings_school" ON library_settings FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "library_book_copies_school" ON library_book_copies;
CREATE POLICY "library_book_copies_school" ON library_book_copies FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ── Backfill copies for books added before this migration ──────────────
INSERT INTO library_book_copies (school_id, book_id, copy_code, status)
SELECT b.school_id, b.id,
       s.code_prefix || '/' || lpad(nextval('library_book_copy_seq')::text, 6, '0'),
       'available'
FROM library_books b
JOIN library_settings s ON s.school_id = b.school_id
CROSS JOIN generate_series(1, b.total_copies) g
WHERE NOT EXISTS (SELECT 1 FROM library_book_copies c WHERE c.book_id = b.id);
