-- ════════════════════════════════════════════════════════════════════════
-- 051_CASH_BANK
-- Cash & Bank / Treasury module. NO second balance system: every balance is
-- derived from the EXISTING General Ledger (journal_entries + journal_entry_lines,
-- source = 'transfer'), exactly like AP / Expenses / Payroll / Assets.
--
--   • cash_transfers            — M-Pesa → Bank, Cash → Bank, Bank → FD etc.
--                                 draft → submitted → approved → posted.
--                                 Posting writes ONE balanced GL entry:
--                                 Dr <to account> | Cr <from account>.
--   • bank_reconciliations      — reconciliation header (period + statement
--                                 closing balance + computed difference)
--   • bank_reconciliation_lines — statement-period GL lines (source='gl') plus
--                                 imported statement rows (source='imported');
--                                 'reconciled' marks what matched the bank.
--
-- GL integration: transfers go through postToJournal (source='transfer').
-- Reconciliation NEVER posts — it only matches GL lines to the statement, so
-- no duplicate journal entries can be created by importing a statement.
--
-- Also adds fee_payments.journal_entry_id so student fee receipts can post
-- Dr <Bank/M-Pesa/Cash> | Cr <Student Fee Receivables> and show up in Treasury.
--
-- Requires migrations 036 (chart/journal) and 043 (ap). Run in Supabase
-- Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Allow 'transfer' in the journal source CHECK (reconciliation never posts).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual', 'fees', 'payroll', 'assets', 'ap', 'expenses', 'refund', 'budget', 'transfer'));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Fee payments → GL link (posted fee receipts roll into Treasury).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Cash Transfers
--    from_account / to_account must be Cash & Bank category accounts (the UI
--    enforces this; the DB only requires asset accounts).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  transfer_no       TEXT NOT NULL,                       -- e.g. TR-0001
  from_account_id   UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  to_account_id     UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  amount            NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  transfer_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  reference         TEXT,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'submitted', 'approved', 'posted', 'cancelled', 'reversed')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES profiles(id),
  submitted_by      UUID REFERENCES profiles(id),
  submitted_at      TIMESTAMPTZ,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  posted_by         UUID REFERENCES profiles(id),
  posted_at         TIMESTAMPTZ,
  reversed_by       UUID REFERENCES profiles(id),
  reversed_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id),
  UNIQUE (school_id, transfer_no)
);

CREATE INDEX IF NOT EXISTS idx_ct_school  ON cash_transfers(school_id);
CREATE INDEX IF NOT EXISTS idx_ct_status  ON cash_transfers(school_id, status);
CREATE INDEX IF NOT EXISTS idx_ct_from    ON cash_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_ct_to      ON cash_transfers(to_account_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Bank Reconciliations (header)
--    gl_closing_balance = GL balance at statement_end_date (opening + postings).
--    unreconciled_amount = net (debit−credit) of statement-period GL lines not
--    matched. difference = statement_closing_balance − (gl_closing − unreconciled).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_id              UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  statement_start_date    DATE NOT NULL,
  statement_end_date      DATE NOT NULL,
  statement_closing_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  gl_closing_balance      NUMERIC(15,2) NOT NULL DEFAULT 0,
  unreconciled_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  difference              NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reconciled', 'cancelled')),
  created_by              UUID REFERENCES profiles(id),
  reconciled_by           UUID REFERENCES profiles(id),
  reconciled_at           TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (statement_start_date <= statement_end_date)
);

CREATE INDEX IF NOT EXISTS idx_br_school  ON bank_reconciliations(school_id);
CREATE INDEX IF NOT EXISTS idx_br_account ON bank_reconciliations(school_id, account_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Reconciliation lines
--    source 'gl'       — snapshot of a GL line in the statement period.
--    source 'imported' — a statement row imported from CSV (NEVER creates a
--                        GL entry). matched_journal_line_id links it to the
--                        GL line it clears.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_reconciliation_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  reconciliation_id       UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
  account_id              UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  journal_line_id         UUID REFERENCES journal_entry_lines(id) ON DELETE SET NULL,
  source                  TEXT NOT NULL DEFAULT 'gl' CHECK (source IN ('gl', 'imported')),
  entry_date              DATE,
  reference               TEXT,
  description             TEXT,
  debit                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'unreconciled' CHECK (status IN ('unreconciled', 'reconciled')),
  matched_journal_line_id UUID REFERENCES journal_entry_lines(id) ON DELETE SET NULL,
  reconciled_by           UUID REFERENCES profiles(id),
  reconciled_at           TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_id, journal_line_id)
);

CREATE INDEX IF NOT EXISTS idx_brl_recon  ON bank_reconciliation_lines(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_brl_line   ON bank_reconciliation_lines(journal_line_id);
CREATE INDEX IF NOT EXISTS idx_brl_matched ON bank_reconciliation_lines(matched_journal_line_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS — finance roles full CRUD, all other staff read-only (same as AP).
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_transfers', 'bank_reconciliations', 'bank_reconciliation_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'fin_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin'')) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin''))', 'fin_all_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL)', 'staff_select_' || t, t);
  END LOOP;
END $$;
