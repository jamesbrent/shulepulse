-- ════════════════════════════════════════════════════════════════════════
-- 042_ALLOWANCE_TAX_TREATMENT
-- Extends allowances with a flexible tax treatment instead of the single
-- "Taxable" boolean:
--
--   • payroll_employee_items.tax_treatment —
--        taxable                  → in Gross Pay AND Taxable Pay
--        non_taxable              → in Gross Pay only (excluded from Taxable Pay)
--        taxable_above_threshold  → in Gross Pay; only the amount above the
--                                   configured tax-free threshold enters Taxable Pay
--        reimbursement            → expense claim, NOT salary earnings — excluded
--                                   from Gross Pay, Taxable Pay and the payroll
--                                   journal (never part of allowances_total)
--
--   • payroll_statutory_config.allowance_exempt_threshold — the per-allowance
--     monthly tax-free amount (default KSh 2,000), effective-date based and
--     governed by the same approved-rate workflow as PAYE/NSSF/SHIF/Housing
--     (migration 041). No thresholds are hard-coded in the payroll engine.
--
-- Requires 041 (status columns) to have run first. Run in Supabase Dashboard
-- → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Allowance tax treatment column + backfill from the old boolean.
--    Existing rows: is_taxable = true  → 'taxable'
--                   is_taxable = false → 'non_taxable'  (unchanged behaviour)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE payroll_employee_items
  ADD COLUMN IF NOT EXISTS tax_treatment TEXT;

UPDATE payroll_employee_items
SET tax_treatment = CASE WHEN is_taxable THEN 'taxable' ELSE 'non_taxable' END
WHERE tax_treatment IS NULL;

ALTER TABLE payroll_employee_items
  ALTER COLUMN tax_treatment SET NOT NULL,
  ALTER COLUMN tax_treatment SET DEFAULT 'taxable';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pei_tax_treatment_check') THEN
    ALTER TABLE payroll_employee_items
      ADD CONSTRAINT pei_tax_treatment_check
      CHECK (tax_treatment IN ('taxable', 'non_taxable', 'taxable_above_threshold', 'reimbursement'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Extend statutory config CHECK to admit the new item.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE payroll_statutory_config
  DROP CONSTRAINT IF EXISTS payroll_statutory_config_item_check;

ALTER TABLE payroll_statutory_config
  ADD CONSTRAINT payroll_statutory_config_item_check
  CHECK (item IN
    ('paye_bands', 'personal_relief', 'nssf_rate', 'shif_rate',
     'housing_levy_rate', 'nita_amount', 'allowance_exempt_threshold'));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Seed the threshold for every school (idempotent). Default: KSh 2,000
--    per allowance per month — the Income Tax Act entertainment-allowance
--    exemption figure. status defaults to 'approved' (migration 041) so it
--    applies immediately; edits go through the normal approval workflow.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO payroll_statutory_config (school_id, item, value, effective_from, notes)
SELECT s.id, 'allowance_exempt_threshold', '{"amount":2000}'::jsonb, '2026-01-01'::date,
  'Tax-free amount per "Taxable Above Threshold" allowance (monthly)'
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_statutory_config p
  WHERE p.school_id = s.id AND p.item = 'allowance_exempt_threshold'
);
