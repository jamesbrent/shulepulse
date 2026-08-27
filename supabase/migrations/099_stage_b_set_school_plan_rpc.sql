-- ============================================================================
-- 099_stage_b_set_school_plan_rpc.sql
-- Stage B: single authoritative, atomic plan-change mechanism
--
-- Replaces every client-side schools.plan write with one SECURITY DEFINER RPC:
--   set_school_plan(p_school_id UUID, p_plan_key TEXT, p_options JSONB)
--
-- Atomic operations inside ONE transaction:
--   1. validates caller is superadmin (DB-enforced)
--   2. validates plan key (basic|pro|enterprise)
--   3. updates schools.plan / subscription dates / status
--   4. deletes non-system overrides that the new plan no longer covers
--   5. writes the subscription audit record
--   6. returns the resulting subscription state (jsonb)
--
-- p_options keys:
--   { subscription_status }  explicit status (default: unchanged)
--   { suspend: true }        => subscription_status = 'suspended' (plan kept)
--   { reactivate: true }     => subscription_status = 'active'
--   { trial_days: n }        => subscription_status = 'trial',
--                                subscription_end = now + n days
--   { subscription_end }     => set explicit end timestamp (extension)
--
-- No normal authenticated user can call this to self-upgrade (superadmin-only).
-- Safe to re-run (CREATE OR REPLACE, no data changes).
-- ============================================================================

CREATE OR REPLACE FUNCTION set_school_plan(
  p_school_id UUID,
  p_plan_key  TEXT,
  p_options   JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   UUID;
  v_caller_role TEXT;
  v_from_plan   TEXT;
  v_status      TEXT;
  v_plan_key    TEXT := p_plan_key;
  v_new_end     TIMESTAMPTZ;
  v_days        INT;
  v_action      TEXT;
  v_result      JSONB;
BEGIN
  -- 1) authorization: superadmin only
  SELECT id, role INTO v_caller_id, v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'forbidden: only superadmin may change school plans'
      USING ERRCODE = '42501';
  END IF;

  -- 2) plan key validation (when supplied)
  IF v_plan_key IS NOT NULL
     AND NOT (v_plan_key = ANY (ARRAY['basic','pro','enterprise']::TEXT[])) THEN
    RAISE EXCEPTION 'invalid plan: %', v_plan_key;
  END IF;

  -- resolve status from options
  IF p_options ? 'suspend' THEN
    v_status := 'suspended';
  ELSIF p_options ? 'reactivate' THEN
    v_status := 'active';
  ELSIF p_options ? 'trial_days' THEN
    v_status := 'trial';
  ELSE
    v_status := p_options->>'subscription_status';
  END IF;

  IF p_options ? 'trial_days' THEN
    v_days   := GREATEST(1, COALESCE((p_options->>'trial_days')::INT, 14));
    v_new_end := now() + (v_days || ' days')::interval;
  ELSIF p_options ? 'subscription_end' THEN
    v_new_end := (p_options->>'subscription_end')::timestamptz;
  END IF;

  SELECT plan INTO v_from_plan FROM schools WHERE id = p_school_id;
  IF v_from_plan IS NULL THEN
    RAISE EXCEPTION 'school not found';
  END IF;

  -- suspending keeps the existing plan; otherwise keep current plan when none supplied
  IF v_plan_key IS NULL THEN
    v_plan_key := v_from_plan;
  END IF;

  -- 3) schools update (single row)
  UPDATE schools SET
    plan                = v_plan_key,
    subscription_start  = CASE
                            WHEN v_status IN ('active','trial') THEN now()
                            ELSE subscription_start
                          END,
    subscription_end    = COALESCE(v_new_end, subscription_end),
    subscription_status = COALESCE(v_status, subscription_status)
  WHERE id = p_school_id;

  -- 4) plan-as-ceiling cleanup: drop non-system overrides no longer covered
  DELETE FROM school_feature_overrides sfo
  WHERE sfo.school_id = p_school_id
    AND COALESCE(sfo.is_system_override, false) = false
    AND sfo.feature_key NOT IN (
      SELECT pf.feature_key FROM plan_features pf WHERE pf.plan_key = v_plan_key
    );

  -- 5) audit
  v_action := CASE
    WHEN v_status = 'suspended'                 THEN 'school.suspended'
    WHEN v_status = 'trial'                     THEN 'school.trial_started'
    WHEN v_status = 'active' AND v_from_plan = v_plan_key THEN 'school.reactivated'
    WHEN p_options ? 'subscription_end' AND v_plan_key = v_from_plan
                                                      THEN 'school.subscription_extended'
    ELSE 'school.plan_changed'
  END;

  INSERT INTO audit_logs (school_id, action, details, performed_by)
  VALUES (
    p_school_id,
    v_action,
    jsonb_build_object(
      'from_plan', v_from_plan,
      'to_plan',   v_plan_key,
      'status',    COALESCE(v_status, 'unchanged'),
      'subscription_end', v_new_end
    ),
    v_caller_id
  );

  -- 6) return resulting subscription state
  SELECT jsonb_build_object(
    'plan',                 s.plan,
    'subscription_status',  s.subscription_status,
    'subscription_start',   s.subscription_start,
    'subscription_end',     s.subscription_end
  )
  INTO v_result
  FROM schools s
  WHERE s.id = p_school_id;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_school_plan(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_school_plan(UUID, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- Guard: direct UPDATEs of schools.plan / subscription_* are rejected.
-- set_school_plan is SECURITY DEFINER and runs as postgres, so its internal
-- UPDATE passes; a direct authenticated/service_role write cannot modify these
-- columns (this closes the "school admin edits schools.plan to self-upgrade"
-- RLS hole). Trigger is intentionally NOT SECURITY DEFINER so current_user
-- reflects the effective caller.
-- ============================================================================
CREATE OR REPLACE FUNCTION guard_schools_subscription_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.plan IS DISTINCT FROM NEW.plan
     OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
     OR OLD.subscription_start  IS DISTINCT FROM NEW.subscription_start
     OR OLD.subscription_end    IS DISTINCT FROM NEW.subscription_end THEN
    IF current_user = 'postgres' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Direct subscription changes are not allowed; use set_school_plan.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_schools_subscription_change ON schools;
CREATE TRIGGER trg_guard_schools_subscription_change
  BEFORE UPDATE ON schools
  FOR EACH ROW
  EXECUTE FUNCTION guard_schools_subscription_change();