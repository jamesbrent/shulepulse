-- ============================================================================
-- 071_feature_access_control.sql
-- Feature Access Control System for Plan-Based Feature Gating
-- ============================================================================
-- This migration creates:
-- 1. feature_catalog — master list of all features in the system
-- 2. Enhanced plans table columns (monthly_price, annual_price, description, is_active)
-- 3. plan_features — which features each plan includes
-- 4. school_feature_overrides — per-school custom feature enable/disable
-- 5. RPC functions for feature resolution
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FEATURE CATALOG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_catalog (
  id            SERIAL PRIMARY KEY,
  feature_key   TEXT NOT NULL UNIQUE,
  module        TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'beta', 'unavailable')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE feature_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_catalog_read_all" ON feature_catalog FOR SELECT USING (true);
CREATE POLICY "feature_catalog_superadmin_all" ON feature_catalog FOR ALL
  USING (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ENHANCE PLANS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE plans ADD COLUMN IF NOT EXISTS monthly_price   NUMERIC DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS annual_price    NUMERIC DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description     TEXT DEFAULT '';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active       BOOLEAN DEFAULT true;

-- Backfill prices from existing hard-coded values
UPDATE plans SET monthly_price = 2500,  annual_price = 25000  WHERE key = 'basic'      AND monthly_price = 0;
UPDATE plans SET monthly_price = 5000,  annual_price = 50000  WHERE key = 'pro'        AND monthly_price = 0;
UPDATE plans SET monthly_price = 10000, annual_price = 100000 WHERE key = 'enterprise' AND monthly_price = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PLAN FEATURES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_features (
  id            SERIAL PRIMARY KEY,
  plan_key      TEXT NOT NULL REFERENCES plans(key) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL REFERENCES feature_catalog(feature_key) ON DELETE CASCADE,
  UNIQUE(plan_key, feature_key)
);

ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_features_read_all" ON plan_features FOR SELECT USING (true);
CREATE POLICY "plan_features_superadmin_all" ON plan_features FOR ALL
  USING (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SCHOOL FEATURE OVERRIDES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS school_feature_overrides (
  id            SERIAL PRIMARY KEY,
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL REFERENCES feature_catalog(feature_key) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(school_id, feature_key)
);

ALTER TABLE school_feature_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_overrides_read_own" ON school_feature_overrides FOR SELECT
  USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "school_overrides_superadmin_all" ON school_feature_overrides FOR ALL
  USING (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADD subscription_status TO SCHOOLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active'
  CHECK (subscription_status IN ('active', 'trial', 'grace_period', 'suspended'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: GET SCHOOL'S EFFECTIVE FEATURES
-- Returns array of feature_keys the school has access to.
-- Resolves: plan features + overrides (enabled) - overrides (disabled)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_school_features(p_school_id UUID)
RETURNS TABLE(feature_key TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH plan_feats AS (
    SELECT pf.feature_key
    FROM plan_features pf
    JOIN schools s ON s.plan = pf.plan_key
    WHERE s.id = p_school_id
  ),
  overrides AS (
    SELECT sfo.feature_key, sfo.enabled
    FROM school_feature_overrides sfo
    WHERE sfo.school_id = p_school_id
  )
  SELECT pf.feature_key
  FROM plan_feats pf
  WHERE NOT EXISTS (
    SELECT 1 FROM overrides o WHERE o.feature_key = pf.feature_key AND o.enabled = false
  )
  UNION
  SELECT o.feature_key
  FROM overrides o
  WHERE o.enabled = true
    AND NOT EXISTS (
      SELECT 1 FROM plan_feats pf WHERE pf.feature_key = o.feature_key
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: CHECK IF SCHOOL HAS A SPECIFIC FEATURE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION school_has_feature(p_school_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM get_school_features(p_school_id) WHERE feature_key = p_feature_key
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC: GET CURRENT USER'S SCHOOL FEATURES
-- Uses auth.uid() to resolve school_id automatically
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_school_features()
RETURNS TABLE(feature_key TEXT) AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
BEGIN
  SELECT school_id, role INTO v_school_id, v_role FROM profiles WHERE id = auth.uid();

  -- Superadmin sees everything
  IF v_role = 'superadmin' THEN
    RETURN QUERY SELECT fc.feature_key FROM feature_catalog fc;
    RETURN;
  END IF;

  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM get_school_features(v_school_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC: CHECK IF CURRENT USER'S SCHOOL HAS A FEATURE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_school_has_feature(p_feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
BEGIN
  SELECT school_id, role INTO v_school_id, v_role FROM profiles WHERE id = auth.uid();

  IF v_role = 'superadmin' THEN RETURN TRUE; END IF;
  IF v_school_id IS NULL THEN RETURN FALSE; END IF;

  RETURN school_has_feature(v_school_id, p_feature_key);
END;
$$ LANGUAGE plpgsql STABLE;
