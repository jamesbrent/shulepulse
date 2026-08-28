-- ============================================================================
-- 122_maintenance_rpc_session_timeout.sql
-- Part 2 follow-up: preserve session idle-timeout parity. The old maintenance
-- object exposed session_timeout_minutes (readable by superadmins only) and
-- App.jsx uses it for the idle timeout. The new public RPC returns only
-- enabled/message, so the idle timeout would silently fall back to 60.
-- Extend get_maintenance_status() to include session_timeout_minutes when the
-- platform settings define one. Safe/idempotent; no data changes.
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
  v_timeout  INTEGER;
BEGIN
  SELECT to_jsonb(ps)->'maintenance' INTO v_settings
  FROM platform_settings ps WHERE id = 1;

  IF v_settings IS NULL OR jsonb_typeof(v_settings) != 'object' THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'message', NULL,
      'session_timeout_minutes', NULL
    );
  END IF;

  v_enabled := COALESCE((v_settings->>'enabled')::BOOLEAN, false);
  v_msg     := v_settings->>'message';
  v_timeout := (v_settings->>'session_timeout_minutes')::INTEGER;

  RETURN jsonb_build_object(
    'enabled', v_enabled,
    'message', v_msg,
    'session_timeout_minutes', v_timeout
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_maintenance_status() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_maintenance_status() TO anon, authenticated, service_role;