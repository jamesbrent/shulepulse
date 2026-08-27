-- ============================================================================
-- 098_stage_a_feature_entitlement_helper.sql
-- Stage A: Foundation entitlement helper (plan-as-ceiling)
--
-- Components:
--  1. is_system_override flag on school_feature_overrides
--     (verified: no equivalent concept exists today; 0 override rows in prod)
--  2. my_has_feature(feature_key) SECURITY DEFINER helper
--     (superadmin bypass, current-school resolution, plan + override resolution)
--  3. get_school_features() aligned to the same plan-as-ceiling rule so the
--     frontend list, the RLS helper, and the RPCs all agree.
--
-- Safe to re-run (all CREATE OR REPLACE / ALTER ... IF NOT EXISTS / no rows).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SYSTEM-LEVEL OVERRIDE FLAG
-- An override marked is_system_override = true is granted by the platform and
-- survives downgrades. Ordinary overrides may NOT raise a school above its
-- plan (plan-as-ceiling).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE school_feature_overrides
  ADD COLUMN IF NOT EXISTS is_system_override BOOLEAN NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. my_has_feature() — centralized entitlement check used by RLS policies
--
--   SECURITY DEFINER (owner = postgres) so reads inside do not re-enter RLS.
--   SET search_path = public to prevent search-path hijacking.
--   STABLE  -> safe to call from policy USING clauses.
--
--   Resolution order:
--     - superadmin  -> true
--     - no school   -> false
--     - plan grants feature  -> true  (unless superadmin disabled it via override)
--     - enabled override     -> true only if plan grants it OR is_system_override
--     - disabled override    -> false (admin may carve features out of a plan)
--   No cross-school lookup: school is ALWAYS resolved from auth.uid().
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_has_feature(p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_role      TEXT;
  v_plan_has  BOOLEAN;
  v_override  RECORD;
BEGIN
  IF p_feature_key IS NULL OR p_feature_key = '' THEN
    RETURN FALSE;
  END IF;

  SELECT school_id, role INTO v_school_id, v_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  IF v_school_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM schools      s
    JOIN plan_features pf ON pf.plan_key = s.plan
                         AND pf.feature_key = p_feature_key
    WHERE s.id = v_school_id
  ) INTO v_plan_has;

  SELECT sfo.feature_key, sfo.enabled, sfo.is_system_override
  INTO v_override
  FROM school_feature_overrides sfo
  WHERE sfo.school_id = v_school_id
    AND sfo.feature_key = p_feature_key;

  IF v_override.feature_key IS NOT NULL THEN
    IF NOT v_override.enabled THEN
      RETURN FALSE;                                      -- explicit carve-out wins
    END IF;
    RETURN v_plan_has OR v_override.is_system_override;   -- plan ceiling applies
  END IF;

  RETURN v_plan_has;
END;
$$;

REVOKE EXECUTE ON FUNCTION my_has_feature(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION my_has_feature(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ALIGN get_school_features() to plan-as-ceiling
-- Kept SECURITY INVOKER (existing behavior) so an arbitrary school id supplied
-- to the RPC is still protected by RLS on the underlying reads (no cross-school
-- leak). Enabled out-of-plan overrides now only grant when is_system_override.
-- ────────────────────────────────────────────────────────────────────────────
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
    SELECT sfo.feature_key, sfo.enabled, sfo.is_system_override
    FROM school_feature_overrides sfo
    WHERE sfo.school_id = p_school_id
  )
  SELECT pf.feature_key
  FROM plan_feats pf
  WHERE NOT EXISTS (
    SELECT 1 FROM overrides o
    WHERE o.feature_key = pf.feature_key AND o.enabled = false
  )
  UNION
  SELECT o.feature_key
  FROM overrides o
  WHERE o.enabled = true
    AND o.is_system_override = true;
END;
$$ LANGUAGE plpgsql STABLE;