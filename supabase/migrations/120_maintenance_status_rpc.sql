-- ============================================================================
-- 120_maintenance_status_rpc.sql
-- BUG FIX (QA audit Part 2): maintenance mode was never actually enforced.
--
-- Root cause: the frontend read maintenance from get_platform_settings_safe(),
-- which returns {"error":"forbidden"} to every non-superadmin (migration 080),
-- which was then deep-merged into the defaults => enabled always resolved to
-- false for every non-superadmin. The gate in App.jsx/Login.jsx never fired.
--
-- Fix: a lightweight, PUBLIC get_maintenance_status() RPC that returns only
-- the maintenance flag + message to ANY visitor (anon for the login page /
-- authenticated for the app). It does NOT expose any other platform settings
-- or secrets. SECURITY DEFINER only to read the single row regardless of RLS.
--
-- Safe/idempotent; no data changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_maintenance_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_enabled  BOOLEAN;
  v_msg      TEXT;
BEGIN
  SELECT to_jsonb(ps)->'maintenance' INTO v_settings
  FROM platform_settings ps WHERE id = 1;

  IF v_settings IS NULL OR jsonb_typeof(v_settings) != 'object' THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'message', NULL
    );
  END IF;

  v_enabled := COALESCE((v_settings->>'enabled')::BOOLEAN, false);
  v_msg     := v_settings->>'message';

  RETURN jsonb_build_object('enabled', v_enabled, 'message', v_msg);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_maintenance_status() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_maintenance_status() TO anon, authenticated, service_role;