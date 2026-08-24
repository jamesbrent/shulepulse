-- ============================================================
-- 080_masked_settings.sql
-- Mask secrets from client-side (VULN-49)
-- ============================================================

-- Function to mask sensitive values before sending to client
CREATE OR REPLACE FUNCTION get_platform_settings_safe()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  settings_row RECORD;
BEGIN
  -- Only superadmin can call
  IF get_my_role() != 'superadmin' THEN
    RETURN '{"error": "forbidden"}'::jsonb;
  END IF;

  SELECT * INTO settings_row FROM platform_settings WHERE id = 1;

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  result := to_jsonb(settings_row);

  -- Mask secret fields in payment_gateways
  IF result ? 'payment_gateways' THEN
    IF (result->'payment_gateways'->>'mpesa_consumer_key') IS NOT NULL
       AND (result->'payment_gateways'->>'mpesa_consumer_key') != '' THEN
      result := jsonb_set(result, '{payment_gateways,mpesa_consumer_key}', '"••••••••"');
    END IF;
    IF (result->'payment_gateways'->>'mpesa_consumer_secret') IS NOT NULL
       AND (result->'payment_gateways'->>'mpesa_consumer_secret') != '' THEN
      result := jsonb_set(result, '{payment_gateways,mpesa_consumer_secret}', '"••••••••"');
    END IF;
    IF (result->'payment_gateways'->>'stripe_secret_key') IS NOT NULL
       AND (result->'payment_gateways'->>'stripe_secret_key') != '' THEN
      result := jsonb_set(result, '{payment_gateways,stripe_secret_key}', '"••••••••"');
    END IF;
    IF (result->'payment_gateways'->>'pesapal_consumer_secret') IS NOT NULL
       AND (result->'payment_gateways'->>'pesapal_consumer_secret') != '' THEN
      result := jsonb_set(result, '{payment_gateways,pesapal_consumer_secret}', '"••••••••"');
    END IF;
    IF (result->'payment_gateways'->>'flutterwave_secret_key') IS NOT NULL
       AND (result->'payment_gateways'->>'flutterwave_secret_key') != '' THEN
      result := jsonb_set(result, '{payment_gateways,flutterwave_secret_key}', '"••••••••"');
    END IF;
  END IF;

  -- Mask SMS API key
  IF result ? 'sms' THEN
    IF (result->'sms'->>'api_key') IS NOT NULL
       AND (result->'sms'->>'api_key') != '' THEN
      result := jsonb_set(result, '{sms,api_key}', '"••••••••"');
    END IF;
  END IF;

  -- Mask email password
  IF result ? 'email' THEN
    IF (result->'email'->>'email_password') IS NOT NULL
       AND (result->'email'->>'email_password') != '' THEN
      result := jsonb_set(result, '{email,email_password}', '"••••••••"');
    END IF;
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_platform_settings_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_platform_settings_safe() TO authenticated;

-- Function to update settings, skipping masked values
CREATE OR REPLACE FUNCTION update_platform_settings_safe(
  p_section TEXT,
  p_values JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing JSONB;
  merged JSONB;
  secret_keys TEXT[] := ARRAY[
    'mpesa_consumer_key', 'mpesa_consumer_secret',
    'stripe_secret_key', 'pesapal_consumer_secret', 'flutterwave_secret_key',
    'api_key', 'email_password'
  ];
  k TEXT;
BEGIN
  IF get_my_role() != 'superadmin' THEN
    RETURN '{"error": "forbidden"}'::jsonb;
  END IF;

  -- Get existing section value
  SELECT p_section::jsonb INTO existing
  FROM platform_settings WHERE id = 1;

  IF existing IS NULL THEN existing := '{}'::jsonb; END IF;

  -- Merge new values
  merged := existing || p_values;

  -- Strip out any secret keys that are still masked
  FOREACH k IN ARRAY secret_keys LOOP
    IF merged ->> k = '••••••••' THEN
      merged := merged - k;
    END IF;
  END LOOP;

  -- Update the section
  EXECUTE format(
    'UPDATE platform_settings SET %I = $1, updated_at = now() WHERE id = 1',
    p_section
  ) USING merged;

  RETURN merged;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_platform_settings_safe(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_platform_settings_safe(TEXT, JSONB) TO authenticated;
