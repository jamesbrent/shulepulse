-- ════════════════════════════════════════════════════════════════════════
-- 039_PAYROLL
-- Kenya-compliant Payroll & Staff Compensation module.
--   • payroll_statutory_config   — effective-date PAYE bands / NSSF / SHIF /
--                                  Housing Levy / NITA (no hard-coded rates)
--   • payroll_employees          — staff on payroll (linked to profiles)
--   • payroll_employee_items     — recurring allowances, deductions, loans,
--                                  advances and employer contributions
--   • payroll_periods            — open/closed month-year pay periods
--   • payroll_runs               — Draft → Calculate → Review → Approve →
--                                  Post → Pay workflow
--   • payroll_lines              — per-employee computed payslip figures
--   • payroll_payment_requests   — net-pay disbursement with admin approval
-- Posts to the General Ledger via postToJournal():
--   Debit  Salaries / Allowances / Employer Contributions
--   Credit PAYE / SHIF / NSSF / Housing Levy / NITA / HELB /
--          Other Deductions / Wages Payable
-- Also backfills the six payroll GL accounts into every school's chart.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Payroll GL accounts (backfilled into every school's chart of accounts)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO chart_of_accounts (school_id, code, name, type, category, description)
SELECT s.id, v.code, v.name, v.type, v.category, v.description
FROM schools s
CROSS JOIN (VALUES
  ('2115', 'SHIF Payable',                  'liability', 'Statutory Payables', 'SHIF/SHA contributions (2.75% of gross)'),
  ('2116', 'Housing Levy Payable',          'liability', 'Statutory Payables', 'Affordable Housing Levy (1.5% employee + 1.5% employer)'),
  ('2117', 'NITA Payable',                  'liability', 'Statutory Payables', 'NITA levy (KSh 50/month, employer only)'),
  ('2150', 'Wages Payable',                 'liability', 'Payroll Payables',   'Net pay due to staff'),
  ('2151', 'Other Payroll Deductions Payable', 'liability', 'Payroll Payables', 'SACCO, union dues, loan & advance recoveries'),
  ('5040', 'Staff Allowances & Overtime',   'expense',   'Salaries & Wages',   'Allowances, bonuses and overtime')
) v(code, name, type, category, description)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.school_id = s.id AND c.code = v.code
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Statutory Configuration (effective-date based — Kenya rates as of 2026)
--    Code calls ensureStatutoryDefaults() for schools created after this
--    migration; the seed below covers every existing school.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_statutory_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  item            TEXT NOT NULL CHECK (item IN
    ('paye_bands', 'personal_relief', 'nssf_rate', 'shif_rate',
     'housing_levy_rate', 'nita_amount')),
  value           JSONB NOT NULL,
  effective_from  DATE NOT NULL DEFAULT '2026-01-01',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psc_school ON payroll_statutory_config(school_id);

-- Seed Kenya 2026 defaults for every school (no-op if already present).
INSERT INTO payroll_statutory_config (school_id, item, value, effective_from, notes)
SELECT s.id, d.item, d.value, d.effective_from, d.notes
FROM schools s
CROSS JOIN (VALUES
  ('paye_bands',
    '[{"from":0,"up_to":24000,"rate":10},{"from":24000,"up_to":32333,"rate":25},{"from":32333,"up_to":500000,"rate":30},{"from":500000,"up_to":800000,"rate":32.5},{"from":800000,"up_to":null,"rate":35}]'::jsonb,
    '2026-01-01'::date,
    'Income Tax Act (Finance Act 2023) PAYE bands'),
  ('personal_relief', '{"amount":2400}'::jsonb, '2026-01-01'::date, 'Monthly personal relief'),
  ('nssf_rate',
    '{"rate":6,"tier1_ceiling":9000,"tier2_ceiling":108000,"max":6480,"employer_match":true}'::jsonb,
    '2026-01-01'::date,
    'NSSF Act 2013 as amended — 6% both tiers, capped at 6,480'),
  ('shif_rate', '{"rate":2.75,"ceiling":null}'::jsonb, '2026-01-01'::date, 'SHIF/SHA 2.75% of gross'),
  ('housing_levy_rate', '{"rate":1.5,"employer_rate":1.5}'::jsonb, '2026-01-01'::date, 'Affordable Housing Levy 1.5% employee + 1.5% employer'),
  ('nita_amount', '{"amount":50,"employer_only":true}'::jsonb, '2026-01-01'::date, 'NITA levy KSh 50/month, employer only')
) d(item, value, effective_from, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_statutory_config p
  WHERE p.school_id = s.id AND p.item = d.item AND p.effective_from = d.effective_from
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Payroll Employees
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  employee_no   TEXT NOT NULL,                      -- e.g. EMP-2026-0001
  staff_type    TEXT NOT NULL DEFAULT 'teaching' CHECK (staff_type IN ('teaching', 'non_teaching')),
  job_title     TEXT,
  department    TEXT,
  basic_salary  NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  kra_pin       TEXT,
  shif_no       TEXT,
  nssf_no       TEXT,
  helb_number   TEXT,
  sacco_name    TEXT,
  union_name    TEXT,
  bank_name     TEXT,
  bank_account  TEXT,
  pay_method    TEXT NOT NULL DEFAULT 'bank' CHECK (pay_method IN ('bank', 'cash', 'mobile')),
  active        BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, employee_no),
  UNIQUE (school_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_pe_school  ON payroll_employees(school_id);
CREATE INDEX IF NOT EXISTS idx_pe_active  ON payroll_employees(school_id, active);
CREATE INDEX IF NOT EXISTS idx_pe_profile ON payroll_employees(profile_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Employee Items (recurring monthly additions / deductions)
--    item_type:
--      allowance             → added to gross (is_taxable → charged PAYE/SHIF)
--      overtime / bonus      → added to gross and always taxable
--      employee_deduction    → deducted from net (is_helb → HELB Payable)
--      employer_contribution → added to employer cost, not taken from pay
--      loan / advance        → recovery repaid from net pay
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_employee_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN
    ('allowance', 'employee_deduction', 'employer_contribution', 'loan', 'advance', 'overtime', 'bonus')),
  name          TEXT NOT NULL,
  amount        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  is_taxable    BOOLEAN NOT NULL DEFAULT true,   -- allowances only
  is_helb       BOOLEAN NOT NULL DEFAULT false,  -- deduction routed to HELB Payable
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pei_school ON payroll_employee_items(school_id);
CREATE INDEX IF NOT EXISTS idx_pei_emp    ON payroll_employee_items(employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Pay Periods
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_month  INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year   INTEGER NOT NULL,
  period_label  TEXT NOT NULL,                     -- e.g. "Aug 2026"
  start_date    DATE,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  UNIQUE (school_id, period_month, period_year)
);

CREATE INDEX IF NOT EXISTS idx_pp_school ON payroll_periods(school_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Payroll Runs (the workflow: draft → calculated → reviewed → approved
--    → posted → paid)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_id         UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  run_no            TEXT NOT NULL,                  -- e.g. PR-2026-08-001
  run_label         TEXT NOT NULL,                  -- e.g. "August 2026 Payroll"
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'calculated', 'reviewed', 'approved', 'posted', 'paid', 'cancelled')),
  totals            JSONB,
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES profiles(id),
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  posted_by         UUID REFERENCES profiles(id),
  posted_at         TIMESTAMPTZ,
  paid_by           UUID REFERENCES profiles(id),
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, run_no)
);

CREATE INDEX IF NOT EXISTS idx_pr_school ON payroll_runs(school_id);
CREATE INDEX IF NOT EXISTS idx_pr_period ON payroll_runs(period_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON payroll_runs(school_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Payroll Lines (per-employee computed payslip figures)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  run_id             UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id        UUID REFERENCES payroll_employees(id) ON DELETE SET NULL,
  employee_no        TEXT,
  employee_name      TEXT NOT NULL,
  staff_type         TEXT,
  basic_salary       NUMERIC(15,2) NOT NULL DEFAULT 0,
  allowances_total   NUMERIC(15,2) NOT NULL DEFAULT 0,
  overtime           NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_pay          NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_pay        NUMERIC(15,2) NOT NULL DEFAULT 0,
  paye               NUMERIC(15,2) NOT NULL DEFAULT 0,
  shif               NUMERIC(15,2) NOT NULL DEFAULT 0,
  nssf_employee      NUMERIC(15,2) NOT NULL DEFAULT 0,
  nssf_employer      NUMERIC(15,2) NOT NULL DEFAULT 0,
  housing_employee   NUMERIC(15,2) NOT NULL DEFAULT 0,
  housing_employer   NUMERIC(15,2) NOT NULL DEFAULT 0,
  nita               NUMERIC(15,2) NOT NULL DEFAULT 0,
  helb               NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_deductions   NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_pay            NUMERIC(15,2) NOT NULL DEFAULT 0,
  employer_total     NUMERIC(15,2) NOT NULL DEFAULT 0,
  breakdown          JSONB,                         -- full itemised snapshot
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pl_school  ON payroll_lines(school_id);
CREATE INDEX IF NOT EXISTS idx_pl_run     ON payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_pl_emp     ON payroll_lines(employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Payment Requests (net-pay disbursement with admin approval)
--    bursar initiates → reviewed → approved by admin/principal →
--    processed (bank) → posted (GL for the bank transfer)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_payment_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  run_id            UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  request_no        TEXT NOT NULL,                  -- e.g. PRQ-2026-08-001
  amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL DEFAULT 'bank' CHECK (payment_method IN ('bank', 'mobile', 'cash', 'cheque')),
  reference_no      TEXT,
  status            TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN
    ('initiated', 'reviewed', 'approved', 'processed', 'posted', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  requested_by      UUID REFERENCES profiles(id),
  reviewed_by       UUID REFERENCES profiles(id),
  reviewed_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  processed_by      UUID REFERENCES profiles(id),
  processed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, request_no)
);

CREATE INDEX IF NOT EXISTS idx_ppr_school ON payroll_payment_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_ppr_run    ON payroll_payment_requests(run_id);
CREATE INDEX IF NOT EXISTS idx_ppr_status ON payroll_payment_requests(school_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. RLS — finance roles manage, all staff read (same pattern as accounting)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_statutory_config','payroll_employees','payroll_employee_items',
    'payroll_periods','payroll_runs','payroll_lines','payroll_payment_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'fin_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin'')) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin''))', 'fin_all_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL)', 'staff_select_' || t, t);
  END LOOP;
END $$;
