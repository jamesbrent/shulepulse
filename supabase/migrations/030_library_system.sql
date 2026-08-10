-- ════════════════════════════════════════════════════════════════════════
-- 030_LIBRARY_SYSTEM
-- Library management: books, categories, shelves, members, loans,
-- reservations, borrowing rules, fines.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Categories ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, name)
);

-- ── Shelves / locations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_shelves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, name)
);

-- ── Books ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  subject TEXT,
  category_id UUID REFERENCES library_categories(id) ON DELETE SET NULL,
  shelf_id UUID REFERENCES library_shelves(id) ON DELETE SET NULL,
  total_copies INTEGER NOT NULL DEFAULT 1 CHECK (total_copies >= 0),
  available_copies INTEGER NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Library Member concept (Student / Teacher / Admin / Librarian / Staff)
-- Parents are simply NOT added here → no borrowing access.
CREATE TABLE IF NOT EXISTS library_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  member_type TEXT NOT NULL CHECK (member_type IN ('student','teacher','admin','librarian','staff')),
  full_name TEXT NOT NULL,
  email TEXT,
  member_code TEXT,
  books_allowed INTEGER NOT NULL DEFAULT 3,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, member_code),
  UNIQUE(school_id, profile_id)
);

-- ── Borrowing rules per member type ────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('student','teacher','admin','librarian','staff')),
  books_allowed INTEGER NOT NULL DEFAULT 3,
  loan_days INTEGER NOT NULL DEFAULT 14,
  renewal_limit INTEGER NOT NULL DEFAULT 1,
  fine_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, member_type)
);

-- ── Loans (borrow / return / renew) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES library_members(id) ON DELETE CASCADE,
  issued_by UUID REFERENCES profiles(id),
  issued_at TIMESTAMPTZ DEFAULT now(),
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  renewed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','returned','overdue','lost','damaged')),
  fine_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Reservations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES library_members(id) ON DELETE CASCADE,
  reserved_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','fulfilled','cancelled')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(book_id, member_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- RLS — every table isolated to its school
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_categories_school" ON library_categories;
DROP POLICY IF EXISTS "library_shelves_school" ON library_shelves;
DROP POLICY IF EXISTS "library_books_school" ON library_books;
DROP POLICY IF EXISTS "library_members_school" ON library_members;
DROP POLICY IF EXISTS "library_rules_school" ON library_rules;
DROP POLICY IF EXISTS "library_loans_school" ON library_loans;
DROP POLICY IF EXISTS "library_reservations_school" ON library_reservations;

CREATE POLICY "library_categories_school" ON library_categories FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "library_shelves_school" ON library_shelves FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "library_books_school" ON library_books FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "library_members_school" ON library_members FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "library_rules_school" ON library_rules FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "library_loans_school" ON library_loans FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "library_reservations_school" ON library_reservations FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- ════════════════════════════════════════════════════════════════════════
-- Seed: default borrowing rules for every school
-- ════════════════════════════════════════════════════════════════════════
INSERT INTO library_rules (school_id, member_type, books_allowed, loan_days, renewal_limit, fine_per_day)
SELECT id, 'student', 3, 14, 1, 20 FROM schools
ON CONFLICT (school_id, member_type) DO NOTHING;

INSERT INTO library_rules (school_id, member_type, books_allowed, loan_days, renewal_limit, fine_per_day)
SELECT id, 'teacher', 5, 30, 2, 20 FROM schools
ON CONFLICT (school_id, member_type) DO NOTHING;

INSERT INTO library_rules (school_id, member_type, books_allowed, loan_days, renewal_limit, fine_per_day)
SELECT id, 'staff', 3, 21, 1, 20 FROM schools
ON CONFLICT (school_id, member_type) DO NOTHING;

INSERT INTO library_rules (school_id, member_type, books_allowed, loan_days, renewal_limit, fine_per_day)
SELECT id, 'admin', 5, 30, 2, 20 FROM schools
ON CONFLICT (school_id, member_type) DO NOTHING;

INSERT INTO library_rules (school_id, member_type, books_allowed, loan_days, renewal_limit, fine_per_day)
SELECT id, 'librarian', 5, 30, 2, 20 FROM schools
ON CONFLICT (school_id, member_type) DO NOTHING;
