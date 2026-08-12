-- ════════════════════════════════════════════════════════════════════════
-- 040_PAYROLL_ACCOUNT_MAPPING
-- Configurable Payroll → Chart of Accounts integration layer.
--
-- Instead of hard-coding GL codes in the payroll posting logic, each school
-- maps its payroll items to its own chart of accounts. The accountant edits
-- these in Payroll → Accounting Mapping. Defaults are seeded from the codes
-- used by migration 039 (no-op where a code is absent from the school chart).
--
-- Items posted by a payroll run:
--   basic_teaching / basic_non_teaching   → salary expense (Dr)
--   allowances                            → allowances, bonuses, overtime (Dr)
--   employer_contributions                → employer NSSF/Housing/NITA (Dr)
--   paye / shif / nssf / housing_levy /
--   nita / helb / other_deductions        → statutory & recovery liabilities (Cr)
--   net_pay                               → wages payable (Cr)
--   bank                                  → disbursement account used when
--                                            paying salaries (Cr on payment)
--
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payroll_account_mapping (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  item        TEXT NOT NULL CHECK (item IN
    ('basic_teaching','basic_non_teaching','allowances','employer_contributions',
     'paye','shif','nssf','housing_levy','nita','helb','other_deductions',
     'net_pay','bank')),
  account_id  UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, item)
);

CREATE INDEX IF NOT EXISTS idx_pam_school ON payroll_account_mapping(school_id);

-- Seed defaults from each school's chart by code (skip codes not present).
-- A school could hold duplicate codes (e.g. two accounts coded 5030); DISTINCT ON
-- picks one account per code, and ON CONFLICT DO NOTHING guarantees re-running is
-- always a safe no-op — never a unique-constraint failure.
WITH coa AS (
  SELECT DISTINCT ON (school_id, code) school_id, code, id
  FROM chart_of_accounts
  ORDER BY school_id, code, created_at
)
INSERT INTO payroll_account_mapping (school_id, item, account_id)
SELECT s.id, v.item, c.id
FROM schools s
JOIN coa c ON c.school_id = s.id
CROSS JOIN (VALUES
  ('basic_teaching',          '5010'),
  ('basic_non_teaching',      '5020'),
  ('allowances',              '5040'),
  ('employer_contributions',  '5030'),
  ('paye',                    '2110'),
  ('shif',                    '2115'),
  ('nssf',                    '2130'),
  ('housing_levy',            '2116'),
  ('nita',                    '2117'),
  ('helb',                    '2140'),
  ('other_deductions',        '2151'),
  ('net_pay',                 '2150'),
  ('bank',                    '1020')
) v(item, code)
ON CONFLICT (school_id, item) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — finance roles manage, all staff read (same pattern as accounting)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE payroll_account_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pam_finance_all" ON payroll_account_mapping;
DROP POLICY IF EXISTS "pam_staff_select" ON payroll_account_mapping;

CREATE POLICY "pam_finance_all" ON payroll_account_mapping FOR ALL
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

CREATE POLICY "pam_staff_select" ON payroll_account_mapping FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL
  );
