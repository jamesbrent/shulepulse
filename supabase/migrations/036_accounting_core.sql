-- ════════════════════════════════════════════════════════════════════════
-- 036_ACCOUNTING_CORE
-- General Ledger foundation for the Finance & Accounting module:
--   • chart_of_accounts      — school-scoped chart with opening balances
--   • journal_entries        — balanced, numbered, status-tracked entries
--   • journal_entry_lines    — debit/credit lines per journal entry
--   • fiscal_periods         — open/closed accounting periods
-- Every future module (Fees, Payroll, Assets, AP/Expenses) posts here via
-- journal_entry_lines, so all transactions roll up into the Trial Balance
-- and financial statements.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Chart of Accounts
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  category         TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coa_school   ON chart_of_accounts(school_id);
CREATE INDEX IF NOT EXISTS idx_coa_type     ON chart_of_accounts(school_id, type);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Journal Entries (headers)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entry_no       TEXT NOT NULL,                    -- e.g. JE-26-000001
  entry_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  description    TEXT,
  source         TEXT NOT NULL DEFAULT 'manual'    -- manual | fees | payroll | assets | ap | expenses | refund
    CHECK (source IN ('manual', 'fees', 'payroll', 'assets', 'ap', 'expenses', 'refund', 'budget')),
  reference_type TEXT,                             -- e.g. fee_payment, payslip, invoice
  reference_id   UUID,
  status         TEXT NOT NULL DEFAULT 'draft'     -- draft | posted | reversed
    CHECK (status IN ('draft', 'posted', 'reversed')),
  reversal_of    UUID REFERENCES journal_entries(id),
  created_by     UUID REFERENCES profiles(id),
  posted_by      UUID REFERENCES profiles(id),
  reversed_by    UUID REFERENCES profiles(id),
  posted_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, entry_no)
);

CREATE INDEX IF NOT EXISTS idx_je_school   ON journal_entries(school_id);
CREATE INDEX IF NOT EXISTS idx_je_status   ON journal_entries(school_id, status);
CREATE INDEX IF NOT EXISTS idx_je_date     ON journal_entries(entry_date);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Journal Entry Lines (the actual ledger postings)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit             NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit            NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a single line cannot be both a debit and a credit
  CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX IF NOT EXISTS idx_jel_entry    ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account  ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jel_school   ON journal_entry_lines(journal_entry_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Fiscal Periods
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fp_school ON fiscal_periods(school_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS — mirror the grades-approval pattern (school_id scoping)
--    Finance roles (admin / bursar / deputy_administrator / superadmin)
--    get full CRUD. All other staff get read-only for their school.
-- ─────────────────────────────────────────────────────────────────────────

-- chart_of_accounts
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coa_finance_all" ON chart_of_accounts;
DROP POLICY IF EXISTS "coa_staff_select" ON chart_of_accounts;
CREATE POLICY "coa_finance_all" ON chart_of_accounts FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  );
CREATE POLICY "coa_staff_select" ON chart_of_accounts FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL
  );

-- journal_entries
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "je_finance_all" ON journal_entries;
DROP POLICY IF EXISTS "je_staff_select" ON journal_entries;
CREATE POLICY "je_finance_all" ON journal_entries FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  );
CREATE POLICY "je_staff_select" ON journal_entries FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL
  );

-- journal_entry_lines
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jel_finance_all" ON journal_entry_lines;
DROP POLICY IF EXISTS "jel_staff_select" ON journal_entry_lines;
CREATE POLICY "jel_finance_all" ON journal_entry_lines FOR ALL
  USING (
    (SELECT school_id FROM profiles WHERE id = auth.uid())
      = (SELECT school_id FROM journal_entries WHERE id = journal_entry_lines.journal_entry_id)
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  )
  WITH CHECK (
    (SELECT school_id FROM profiles WHERE id = auth.uid())
      = (SELECT school_id FROM journal_entries WHERE id = journal_entry_lines.journal_entry_id)
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  );
CREATE POLICY "jel_staff_select" ON journal_entry_lines FOR SELECT
  USING (
    (SELECT school_id FROM profiles WHERE id = auth.uid())
      = (SELECT school_id FROM journal_entries WHERE id = journal_entry_lines.journal_entry_id)
  );

-- fiscal_periods
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fp_finance_all" ON fiscal_periods;
DROP POLICY IF EXISTS "fp_staff_select" ON fiscal_periods;
CREATE POLICY "fp_finance_all" ON fiscal_periods FOR ALL
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('admin', 'bursar', 'deputy_administrator', 'superadmin')
  );
CREATE POLICY "fp_staff_select" ON fiscal_periods FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 6. audit_logs — allow school staff to record finance audit events.
--    Keeps the existing superadmin insert policy; adds school-scoped insert.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_logs_insert_school_staff" ON audit_logs;
CREATE POLICY "audit_logs_insert_school_staff" ON audit_logs
  FOR INSERT
  WITH CHECK (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
