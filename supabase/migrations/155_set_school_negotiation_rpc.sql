-- Migration 155: set_school_negotiation RPC
-- Superadmin-only RPC to set or clear a per-school negotiated price.
-- Appends an audit trail (school.negotiated / school.negotiation_cleared).

CREATE OR REPLACE FUNCTION set_school_negotiation(
  p_school_id UUID,
  p_negotiated_monthly_price NUMERIC DEFAULT NULL,
  p_negotiated_annual_price NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_standard_price NUMERIC;
  v_plan_key TEXT;
  v_result JSONB;
BEGIN
  SELECT id, role INTO v_caller_id, v_caller_role
  FROM profiles WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'forbidden: only superadmin may set negotiated pricing'
      USING ERRCODE = '42501';
  END IF;

  SELECT plan INTO v_plan_key FROM schools WHERE id = p_school_id;
  IF v_plan_key IS NULL THEN
    RAISE EXCEPTION 'school not found';
  END IF;

  SELECT monthly_price INTO v_standard_price FROM plans WHERE key = v_plan_key;

  UPDATE schools SET
    negotiated_monthly_price = p_negotiated_monthly_price,
    negotiated_annual_price  = p_negotiated_annual_price,
    negotiated_at            = CASE WHEN p_negotiated_monthly_price IS NOT NULL THEN now() ELSE NULL END,
    negotiated_by            = CASE WHEN p_negotiated_monthly_price IS NOT NULL THEN v_caller_id ELSE NULL END,
    negotiated_notes         = p_notes
  WHERE id = p_school_id;

  IF p_negotiated_monthly_price IS NOT NULL THEN
    INSERT INTO audit_logs (school_id, action, details, performed_by)
    VALUES (
      p_school_id,
      'school.negotiated',
      jsonb_build_object(
        'standard_monthly_price',    v_standard_price,
        'negotiated_monthly_price',  p_negotiated_monthly_price,
        'negotiated_annual_price',   p_negotiated_annual_price,
        'discount',                  COALESCE(v_standard_price, 0) - p_negotiated_monthly_price,
        'notes',                     p_notes
      ),
      v_caller_id
    );
  ELSE
    INSERT INTO audit_logs (school_id, action, details, performed_by)
    VALUES (
      p_school_id,
      'school.negotiation_cleared',
      jsonb_build_object('cleared_at', now()),
      v_caller_id
    );
  END IF;

  SELECT jsonb_build_object(
    'plan',                       s.plan,
    'negotiated_monthly_price',   s.negotiated_monthly_price,
    'negotiated_annual_price',    s.negotiated_annual_price,
    'negotiated_at',              s.negotiated_at,
    'negotiated_by',              s.negotiated_by,
    'negotiated_notes',           s.negotiated_notes,
    'standard_monthly_price',     v_standard_price
  )
  INTO v_result
  FROM schools s WHERE s.id = p_school_id;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_school_negotiation(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_school_negotiation(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- Extend set_school_plan with negotiated-price handling.
-- p_options new keys:
--   { negotiated_monthly_price }   carry a deal onto a new plan
--   { negotiated_annual_price }    optional annual figure for that deal
--   { negotiated_notes }           deal note
--   { clear_negotiation: true }    explicit clearing (allowed on any call)
-- Default: changing to a DIFFERENT plan clears any existing negotiation
-- (deals are per-plan). Setting a negotiated price during the plan change
-- overrides the clearing default.
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
  v_clear_negotiation BOOLEAN := FALSE;
  v_new_negotiated NUMERIC;
  v_new_negotiated_annual NUMERIC;
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

  -- negotiation: explicit clear wins; otherwise changing plan clears the old deal
  -- unless a new negotiated price is being set in the same call.
  IF p_options ? 'clear_negotiation' THEN
    v_clear_negotiation := COALESCE((p_options->>'clear_negotiation')::BOOLEAN, FALSE);
  ELSIF v_plan_key IS DISTINCT FROM v_from_plan AND NOT (p_options ? 'negotiated_monthly_price') THEN
    v_clear_negotiation := TRUE;
  END IF;

  IF p_options ? 'negotiated_monthly_price' THEN
    v_new_negotiated := (p_options->>'negotiated_monthly_price')::NUMERIC;
  END IF;
  IF p_options ? 'negotiated_annual_price' THEN
    v_new_negotiated_annual := (p_options->>'negotiated_annual_price')::NUMERIC;
  END IF;

  -- 3) schools update (single row)
  UPDATE schools SET
    plan                = v_plan_key,
    subscription_start  = CASE
                            WHEN v_status IN ('active','trial') THEN now()
                            ELSE subscription_start
                          END,
    subscription_end    = COALESCE(v_new_end, subscription_end),
    subscription_status = COALESCE(v_status, subscription_status),
    negotiated_monthly_price = CASE
      WHEN p_options ? 'negotiated_monthly_price' THEN v_new_negotiated
      WHEN v_clear_negotiation THEN NULL
      ELSE negotiated_monthly_price
    END,
    negotiated_annual_price = CASE
      WHEN p_options ? 'negotiated_annual_price' THEN v_new_negotiated_annual
      WHEN v_clear_negotiation THEN NULL
      ELSE negotiated_annual_price
    END,
    negotiated_at = CASE
      WHEN p_options ? 'negotiated_monthly_price' THEN now()
      WHEN v_clear_negotiation THEN NULL
      ELSE negotiated_at
    END,
    negotiated_by = CASE
      WHEN p_options ? 'negotiated_monthly_price' THEN v_caller_id
      WHEN v_clear_negotiation THEN NULL
      ELSE negotiated_by
    END,
    negotiated_notes = CASE
      WHEN p_options ? 'negotiated_notes' THEN p_options->>'negotiated_notes'
      WHEN v_clear_negotiation THEN NULL
      ELSE negotiated_notes
    END
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
      'subscription_end', v_new_end,
      'negotiated_monthly_price', CASE
        WHEN p_options ? 'negotiated_monthly_price' THEN v_new_negotiated
        WHEN v_clear_negotiation THEN NULL
        ELSE (SELECT negotiated_monthly_price FROM schools WHERE id = p_school_id)
      END,
      'negotiation_cleared', v_clear_negotiation
    ),
    v_caller_id
  );

  -- 6) return resulting subscription state
  SELECT jsonb_build_object(
    'plan',                     s.plan,
    'subscription_status',      s.subscription_status,
    'subscription_start',       s.subscription_start,
    'subscription_end',         s.subscription_end,
    'negotiated_monthly_price', s.negotiated_monthly_price,
    'negotiated_annual_price',  s.negotiated_annual_price,
    'negotiated_at',            s.negotiated_at,
    'negotiated_by',            s.negotiated_by,
    'negotiated_notes',         s.negotiated_notes
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
-- Guard: direct UPDATEs of negotiated_* columns are rejected for non-postgres
-- callers. set_school_negotiation / set_school_plan are SECURITY DEFINER and run
-- as postgres, so their internal UPDATEs pass. Superadmin onboards a school via
-- INSERT (not UPDATE), which is unaffected. This closes the "school admin edits
-- schools.negotiated_* directly" RLS hole.
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
     OR OLD.subscription_end    IS DISTINCT FROM NEW.subscription_end
     OR OLD.negotiated_monthly_price IS DISTINCT FROM NEW.negotiated_monthly_price
     OR OLD.negotiated_annual_price  IS DISTINCT FROM NEW.negotiated_annual_price
     OR OLD.negotiated_at       IS DISTINCT FROM NEW.negotiated_at
     OR OLD.negotiated_by       IS DISTINCT FROM NEW.negotiated_by
     OR OLD.negotiated_notes    IS DISTINCT FROM NEW.negotiated_notes THEN
    IF current_user = 'postgres' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Direct subscription/negotiation changes are not allowed; use set_school_plan or set_school_negotiation.'
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