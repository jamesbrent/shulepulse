-- ════════════════════════════════════════════════════════════════════════
-- 045_TAX_CAPITAL_ALLOWANCES
-- Separate KENYAN TAX CAPITAL ALLOWANCES from FINANCIAL ACCOUNTING
-- DEPRECIATION. The accounting engine (037/038) is untouched; this adds a
-- fully separate, effective-date-based tax layer that NEVER posts to the
-- General Ledger.
--
--   • tax_rules            — configurable statutory tax rules (wear & tear
--                            + investment allowance), each with rate,
--                            calculation method, effective/expiry date and
--                            statutory source reference.
--   • asset_tax_schedules  — per-asset, per-year-of-income tax computation.
--                            Each row snapshots the rule version used so a
--                            later rule change never rewrites history.
--   • fixed_assets         — gains investment_class (optional investment
--                            allowance category). tax_class is now treated
--                            ONLY as the Kenyan tax classification and no
--                            longer overrides accounting depreciation.
--
-- Accounting depreciation → General Ledger (unchanged).
-- Tax capital allowances → tax schedule / reporting layer only (no GL).
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. tax_rules — configurable statutory tax rules
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  rule_type             TEXT NOT NULL CHECK (rule_type IN ('wear_tear', 'investment')),
  tax_class             TEXT NOT NULL,             -- stable key, e.g. class_i / inv_b_hotel
  description           TEXT,
  asset_classification  TEXT,                      -- statutory wording of what the class covers
  rate                  NUMERIC(6,2) NOT NULL DEFAULT 0,  -- annual % (or flat % of cost)
  first_year_rate       NUMERIC(6,2) NOT NULL DEFAULT 0,  -- first-year/investment initial %
  calc_method           TEXT NOT NULL DEFAULT 'reducing_balance'
    CHECK (calc_method IN ('reducing_balance', 'straight_line', 'flat_percentage')),
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date           DATE,
  source_reference      TEXT,                      -- Income Tax Act / Finance Act citation
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tr_school   ON tax_rules(school_id);
CREATE INDEX IF NOT EXISTS idx_tr_active   ON tax_rules(school_id, rule_type, is_active, effective_date);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. asset_tax_schedules — one row per asset per year of income
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_tax_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id              UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  year_of_income        INTEGER NOT NULL,
  rule_id               UUID REFERENCES tax_rules(id) ON DELETE SET NULL,
  investment_rule_id    UUID REFERENCES tax_rules(id) ON DELETE SET NULL,
  tax_class             TEXT,
  tax_basis             NUMERIC(15,2) NOT NULL DEFAULT 0,   -- tax basis = cost for tax purposes
  opening_wtd           NUMERIC(15,2) NOT NULL DEFAULT 0,   -- opening tax written down value
  wear_tear_rate        NUMERIC(6,2) NOT NULL DEFAULT 0,
  wear_tear_allowance   NUMERIC(15,2) NOT NULL DEFAULT 0,
  investment_rate       NUMERIC(6,2) NOT NULL DEFAULT 0,
  investment_allowance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_allowance       NUMERIC(15,2) NOT NULL DEFAULT 0,
  closing_wtd           NUMERIC(15,2) NOT NULL DEFAULT 0,   -- closing tax written down value
  rule_snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb, -- rule/version used — never rewritten
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, asset_id, year_of_income)
);

CREATE INDEX IF NOT EXISTS idx_ats_school ON asset_tax_schedules(school_id);
CREATE INDEX IF NOT EXISTS idx_ats_asset  ON asset_tax_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_ats_year   ON asset_tax_schedules(year_of_income);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. fixed_assets — optional investment allowance category
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS investment_class TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Default statutory rules (seed data only — editable in Tax Rules admin;
--    never treat these as permanently correct legislation).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_default_tax_rules(p_school_id UUID)
RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tax_rules WHERE school_id = p_school_id) THEN
    RETURN;
  END IF;

  INSERT INTO tax_rules
    (school_id, rule_type, tax_class, description, asset_classification,
     rate, first_year_rate, calc_method, effective_date, source_reference, is_active)
  VALUES
    -- Wear & Tear classes (Income Tax Act (Cap 470) — Second Schedule)
    (p_school_id, 'wear_tear', 'class_i', 'Class I',
     'Computers, word processors, calculators, copiers, duplicating machines and other electronic/data-processing equipment',
     37.5, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class I (as amended)', true),
    (p_school_id, 'wear_tear', 'class_ii', 'Class II',
     'Self-propelling and other machines and plant (incl. manufacturing machinery, construction and earth-moving equipment)',
     30, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class II (as amended)', true),
    (p_school_id, 'wear_tear', 'class_iii', 'Class III',
     'Motor vehicles and heavy earth-moving equipment (non-self-propelling)',
     25, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class III (as amended)', true),
    (p_school_id, 'wear_tear', 'class_iv', 'Class IV',
     'Furniture, fixtures and general fittings',
     12.5, 0, 'reducing_balance', '2017-01-01', 'Income Tax Act (Cap 470) — Second Schedule, Class IV (as amended)', true),

    -- Investment allowance — Buildings (Investment Deduction; verify rates
    -- against the applicable Finance Act and update via Tax Rules admin).
    (p_school_id, 'investment', 'inv_b_hotel', 'Buildings — Hotel buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_manufacture', 'Buildings — Buildings used for manufacture', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_hospital', 'Buildings — Hospital buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_petroleum', 'Buildings — Petroleum/gas storage facilities', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_educational', 'Buildings — Educational buildings incl. student hostels', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_commercial', 'Buildings — Commercial buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_industrial', 'Buildings — Industrial buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_b_other', 'Buildings — Other qualifying buildings', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),

    -- Investment allowance — Machinery
    (p_school_id, 'investment', 'inv_m_manufacture', 'Machinery — Machinery used for manufacture', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_hospital', 'Machinery — Hospital equipment', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_ships_aircraft', 'Machinery — Ships/aircraft', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_motor_vehicles', 'Machinery — Motor vehicles and heavy earth-moving equipment', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_computers', 'Machinery — Computer and peripheral computer hardware/software', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_copiers', 'Machinery — Calculators, copiers and duplicating machines', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true),
    (p_school_id, 'investment', 'inv_m_other', 'Machinery — Other qualifying machinery', NULL, 25, 50, 'flat_percentage', '2017-01-01', 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill for existing schools.
SELECT seed_default_tax_rules(id) FROM schools;

-- Auto-seed when a new school is created.
CREATE OR REPLACE FUNCTION seed_tax_rules_for_new_school() RETURNS trigger AS $$
BEGIN
  PERFORM seed_default_tax_rules(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_tax_rules ON schools;
CREATE TRIGGER trg_seed_tax_rules AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION seed_tax_rules_for_new_school();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Re-point legacy KRA tax classes (038) onto the new class I–IV keys so
--    existing categories/assets keep computing against the statutory set.
--    No accounting depreciation values are touched.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE asset_categories SET tax_class = 'class_i'   WHERE tax_class = 'computers';
UPDATE asset_categories SET tax_class = 'class_ii'  WHERE tax_class = 'manufacturing';
UPDATE asset_categories SET tax_class = 'class_iii' WHERE tax_class = 'motor_vehicles';
UPDATE asset_categories SET tax_class = 'class_iv'  WHERE tax_class = 'furniture';

UPDATE fixed_assets SET tax_class = 'class_i'   WHERE tax_class = 'computers';
UPDATE fixed_assets SET tax_class = 'class_ii'  WHERE tax_class = 'manufacturing';
UPDATE fixed_assets SET tax_class = 'class_iii' WHERE tax_class = 'motor_vehicles';
UPDATE fixed_assets SET tax_class = 'class_iv'  WHERE tax_class = 'furniture';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS — finance roles manage, all staff read (same pattern as assets)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_rules','asset_tax_schedules']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'fin_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin'')) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (''admin'',''bursar'',''deputy_administrator'',''superadmin''))', 'fin_all_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) IS NOT NULL)', 'staff_select_' || t, t);
  END LOOP;
END $$;
