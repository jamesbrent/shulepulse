-- ════════════════════════════════════════════════════════════════════════
-- 054_ASSET_CLASS_GL_ACCOUNTS
-- Depreciation Module — Hybrid Method (per-item calculation, per-class GL).
--   • asset_categories gets its own GL account pair so the run posts
--     ONE journal entry per asset class:
--        Dr  Depreciation Expense - [Class]
--        Cr  Accumulated Depreciation - [Class]
--     NEVER crediting the asset cost account.
--   • asset_depreciation_lines gains the spec's per-schedule `posted` flag
--     (depreciation_schedules.posted_flag). Lines are written by a posted
--     run, so they default to true.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Per-class GL account pair (FK to ChartOfAccounts, e.g. 6010 / 1701).
ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS expense_account_id     UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accumulated_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_asset_cat_expense_acc ON asset_categories(expense_account_id);
CREATE INDEX IF NOT EXISTS idx_asset_cat_accum_acc   ON asset_categories(accumulated_account_id);

-- 2. Per-schedule posted flag (spec: depreciation_schedules.posted_flag).
ALTER TABLE asset_depreciation_lines
  ADD COLUMN IF NOT EXISTS posted BOOLEAN NOT NULL DEFAULT true;

-- 3. Backfill each class from the standard depreciation accounts
--    (6010–6060 expense / 1701–1706 accumulated), mirroring the app's class
--    mapping in assetsUtils.depreciationAccountsFor. Classes whose names do
--    not match a keyword fall back to the "Other" pair (6060 / 1706), exactly
--    as the app did before — so existing behaviour is preserved.
UPDATE asset_categories c SET
  expense_account_id = (
    SELECT e.id FROM chart_of_accounts e
    WHERE e.school_id = c.school_id
      AND e.type = 'expense' AND e.category = 'Depreciation'
      AND (
        (lower(c.name) LIKE '%build%'     AND e.code = '6010') OR
        (lower(c.name) LIKE '%motor%'     AND e.code = '6020') OR
        (lower(c.name) LIKE '%vehicle%'   AND e.code = '6020') OR
        (lower(c.name) LIKE '%furnitur%'  AND e.code = '6030') OR
        (lower(c.name) LIKE '%fitting%'   AND e.code = '6030') OR
        (lower(c.name) LIKE '%computer%'  AND e.code = '6040') OR
        (lower(c.name) LIKE '%ict%'       AND e.code = '6040') OR
        (lower(c.name) LIKE '%technolog%' AND e.code = '6040') OR
        (lower(c.name) LIKE '%equipment%' AND e.code = '6050') OR
        (lower(c.name) LIKE '%lab%'       AND e.code = '6050') OR
        (lower(c.name) LIKE '%school%'    AND e.code = '6050')
      )
    ORDER BY e.code LIMIT 1
  ),
  accumulated_account_id = (
    SELECT a.id FROM chart_of_accounts a
    WHERE a.school_id = c.school_id
      AND a.type = 'asset' AND a.category = 'Accumulated Depreciation'
      AND (
        (lower(c.name) LIKE '%build%'     AND a.code = '1701') OR
        (lower(c.name) LIKE '%motor%'     AND a.code = '1702') OR
        (lower(c.name) LIKE '%vehicle%'   AND a.code = '1702') OR
        (lower(c.name) LIKE '%furnitur%'  AND a.code = '1703') OR
        (lower(c.name) LIKE '%fitting%'   AND a.code = '1703') OR
        (lower(c.name) LIKE '%computer%'  AND a.code = '1704') OR
        (lower(c.name) LIKE '%ict%'       AND a.code = '1704') OR
        (lower(c.name) LIKE '%technolog%' AND a.code = '1704') OR
        (lower(c.name) LIKE '%equipment%' AND a.code = '1705') OR
        (lower(c.name) LIKE '%lab%'       AND a.code = '1705') OR
        (lower(c.name) LIKE '%school%'    AND a.code = '1705')
      )
    ORDER BY a.code LIMIT 1
  )
WHERE c.expense_account_id IS NULL;

UPDATE asset_categories c SET
  expense_account_id = (
    SELECT e.id FROM chart_of_accounts e
    WHERE e.school_id = c.school_id
      AND e.type = 'expense' AND e.category = 'Depreciation' AND e.code = '6060'
  ),
  accumulated_account_id = (
    SELECT a.id FROM chart_of_accounts a
    WHERE a.school_id = c.school_id
      AND a.type = 'asset' AND a.category = 'Accumulated Depreciation' AND a.code = '1706'
  )
WHERE c.expense_account_id IS NULL;
