-- ════════════════════════════════════════════════════════════════════════
-- 038_KRA_CAPITAL_ALLOWANCES
-- KRA Tax Wear & Tear (Capital Allowances) classes replace arbitrary
-- company depreciation rates in the Fixed Assets module:
--   • computers       → 20% reducing balance
--   • motor_vehicles  → 25% reducing balance
--   • furniture       → 10% reducing balance
--   • manufacturing   → 50% first-year allowance, then 25% on the residue
-- Adds a tax_class + first_year_allowance to asset_categories and
-- fixed_assets, then backfills any existing data. Safe to re-run.
-- Run in Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS tax_class TEXT;
ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS first_year_allowance NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS tax_class TEXT;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS first_year_allowance NUMERIC(6,2) NOT NULL DEFAULT 0;

-- Apply the KRA policy to any category already tagged (harmless if none yet).
UPDATE asset_categories SET
  depreciation_method = 'reducing_balance',
  depreciation_rate = CASE tax_class
      WHEN 'computers'      THEN 20
      WHEN 'motor_vehicles' THEN 25
      WHEN 'furniture'      THEN 10
      WHEN 'manufacturing'  THEN 25
      ELSE depreciation_rate END,
  first_year_allowance = CASE tax_class WHEN 'manufacturing' THEN 50 ELSE 0 END
WHERE tax_class IS NOT NULL;

-- Propagate the policy to existing assets in tagged categories.
UPDATE fixed_assets fa SET
  tax_class = c.tax_class,
  depreciation_method = 'reducing_balance',
  depreciation_rate = CASE c.tax_class
      WHEN 'computers'      THEN 20
      WHEN 'motor_vehicles' THEN 25
      WHEN 'furniture'      THEN 10
      WHEN 'manufacturing'  THEN 25
      ELSE fa.depreciation_rate END,
  first_year_allowance = CASE c.tax_class WHEN 'manufacturing' THEN 50 ELSE 0 END
FROM asset_categories c
WHERE c.id = fa.category_id
  AND c.tax_class IS NOT NULL
  AND fa.tax_class IS NULL;
