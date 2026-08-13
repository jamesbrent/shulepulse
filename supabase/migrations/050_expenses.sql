-- ════════════════════════════════════════════════════════════════════════
-- 050_EXPENSES
-- Direct Expenses module: operational expenses that do NOT belong in
-- Accounts Payable (supplier credit), Payroll (salaries) or Fixed Assets
-- (capital purchases).
--
--   • expenses       — expense header with its own approval chain
--                      draft → submitted → reviewed → approved → paid → posted
--   • expense_lines  — multi-line items (expense account, amount, dept, centre)
--
-- GL integration: posting goes through the EXISTING engine
-- (journal_entries / journal_entry_lines, source = 'expenses', which the
-- accounting-core CHECK already permits). Exactly-once is enforced by
-- expenses.journal_entry_id.
--   Paid immediately : Dr Expense line(s)          | Cr Bank/Cash/M-Pesa
--   Approved unpaid  : Dr Expense line(s)          | Cr Accrued Expenses (2020)
--   Later settlement : Dr Accrued Expenses         | Cr Bank/Cash/M-Pesa
--
-- Requires migrations 036 (chart/journal) and 043 (ap_suppliers + attachments).
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Extend the shared attachment system so it can host expense documents
--    (receipts, invoices, payment confirmations, scanned/supporting docs).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE finance_attachments DROP CONSTRAINT IF EXISTS finance_attachments_entity_type_check;
ALTER TABLE finance_attachments ADD CONSTRAINT finance_attachments_entity_type_check
  CHECK (entity_type IN ('supplier', 'invoice', 'payment', 'voucher', 'expense'));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Expenses (headers)
--    payment_status reflects money actually paid at record time / after
--    settlement (unpaid | partially_paid | paid) and drives the GL credits
--    at posting. `status` is the approval workflow.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  expense_no            TEXT NOT NULL,                   -- e.g. EXP-2026-00001
  expense_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  payee_type            TEXT NOT NULL DEFAULT 'other' CHECK (payee_type IN ('staff', 'supplier', 'other', 'cash')),
  supplier_id           UUID REFERENCES ap_suppliers(id) ON DELETE SET NULL,
  payee_name            TEXT,                            -- staff / other / cash purchase
  description           TEXT,
  department            TEXT,
  cost_centre           TEXT,
  payment_method        TEXT CHECK (payment_method IN ('bank', 'mobile', 'cash')),
  payment_account_id    UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  payment_reference     TEXT,                            -- receipt / trx / cheque / M-Pesa ref
  payment_date          DATE,
  total_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_status        TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'submitted', 'reviewed', 'approved', 'paid', 'posted', 'rejected', 'cancelled')),
  journal_entry_id      UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  settlement_journal_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES profiles(id),
  submitted_by          UUID REFERENCES profiles(id),
  submitted_at          TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES profiles(id),
  reviewed_at           TIMESTAMPTZ,
  approved_by           UUID REFERENCES profiles(id),
  approved_at           TIMESTAMPTZ,
  paid_by               UUID REFERENCES profiles(id),
  paid_at               TIMESTAMPTZ,
  posted_by             UUID REFERENCES profiles(id),
  posted_at             TIMESTAMPTZ,
  rejected_by           UUID REFERENCES profiles(id),
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, expense_no)
);

CREATE INDEX IF NOT EXISTS idx_exp_school  ON expenses(school_id);
CREATE INDEX IF NOT EXISTS idx_exp_status  ON expenses(school_id, status);
CREATE INDEX IF NOT EXISTS idx_exp_date    ON expenses(expense_date);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Expense line items (expense account chosen from the chart)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  expense_id    UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  description   TEXT NOT NULL,
  amount        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  department    TEXT,
  cost_centre   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expl_expense ON expense_lines(expense_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — same finance model as accounting / AP:
--    finance roles full CRUD, all other staff read-only.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses', 'expense_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'fin_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin'')) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin''))', 'fin_all_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL)', 'staff_select_' || t, t);
  END LOOP;
END $$;
