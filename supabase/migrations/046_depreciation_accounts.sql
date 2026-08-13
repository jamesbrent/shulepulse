-- ════════════════════════════════════════════════════════════════════════
-- 046_DEPRECIATION_ACCOUNTS
-- Ensures every school's Chart of Accounts contains the standard, dedicated
-- depreciation accounts used by the Fixed Assets module. These are required
-- so the Run Depreciation dropdowns and per-asset auto-mapping stay strictly
-- filtered (expense = Depreciation, accumulated = Accumulated Depreciation).
--
--   Expense (type = expense, category = 'Depreciation'):
--     6010 Buildings · 6020 Motor Vehicles · 6030 Furniture & Fittings
--     6040 Computers & ICT · 6050 School Equipment · 6060 Other
--   Accumulated (type = asset, category = 'Accumulated Depreciation'):
--     1701 Buildings · 1702 Motor Vehicles · 1703 Furniture & Fittings
--     1704 Computers & ICT · 1705 School Equipment · 1706 Other
--
-- Safe to re-run (skips accounts that already exist). Run in Supabase
-- Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO chart_of_accounts (school_id, code, name, type, category, is_active)
SELECT s.id, c.code, c.name, c.type, c.category, true
FROM schools s
CROSS JOIN (
  VALUES
    -- Depreciation expense accounts
    ('6010', 'Depreciation Expense — Buildings',                    'expense', 'Depreciation'),
    ('6020', 'Depreciation Expense — Motor Vehicles',               'expense', 'Depreciation'),
    ('6030', 'Depreciation Expense — Furniture & Fittings',         'expense', 'Depreciation'),
    ('6040', 'Depreciation Expense — Computers & ICT Equipment',    'expense', 'Depreciation'),
    ('6050', 'Depreciation Expense — School Equipment',             'expense', 'Depreciation'),
    ('6060', 'Depreciation Expense — Other Fixed Assets',           'expense', 'Depreciation'),
    -- Accumulated depreciation (contra-asset) accounts
    ('1701', 'Accumulated Depreciation — Buildings',                'asset',   'Accumulated Depreciation'),
    ('1702', 'Accumulated Depreciation — Motor Vehicles',           'asset',   'Accumulated Depreciation'),
    ('1703', 'Accumulated Depreciation — Furniture & Fittings',     'asset',   'Accumulated Depreciation'),
    ('1704', 'Accumulated Depreciation — Computers & ICT Equipment','asset',   'Accumulated Depreciation'),
    ('1705', 'Accumulated Depreciation — School Equipment',         'asset',   'Accumulated Depreciation'),
    ('1706', 'Accumulated Depreciation — Other Fixed Assets',       'asset',   'Accumulated Depreciation')
) AS c(code, name, type, category)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts a
  WHERE a.school_id = s.id AND a.code = c.code
);

-- Fix classification on any existing rows that use a legacy or incorrect
-- category so the strict UI filters still match them (does not touch values).
UPDATE chart_of_accounts SET
  type = CASE
    WHEN code IN ('6010','6020','6030','6040','6050','6060') THEN 'expense'
    WHEN code IN ('1701','1702','1703','1704','1705','1706') THEN 'asset'
    ELSE type END,
  category = CASE
    WHEN code IN ('6010','6020','6030','6040','6050','6060') THEN 'Depreciation'
    WHEN code IN ('1701','1702','1703','1704','1705','1706') THEN 'Accumulated Depreciation'
    ELSE category END
WHERE code IN ('6010','6020','6030','6040','6050','6060','1701','1702','1703','1704','1705','1706')
  AND (type, category) IS DISTINCT FROM (
    CASE
      WHEN code IN ('6010','6020','6030','6040','6050','6060') THEN 'expense'
      WHEN code IN ('1701','1702','1703','1704','1705','1706') THEN 'asset'
      ELSE type END,
    CASE
      WHEN code IN ('6010','6020','6030','6040','6050','6060') THEN 'Depreciation'
      WHEN code IN ('1701','1702','1703','1704','1705','1706') THEN 'Accumulated Depreciation'
      ELSE category END
  );
