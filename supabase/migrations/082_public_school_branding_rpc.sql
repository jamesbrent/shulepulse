-- Public RPC to fetch school branding without authentication
-- Used by the login page to apply school colors before login

CREATE OR REPLACE FUNCTION get_school_branding(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'primary_color', COALESCE(primary_color, '#2563eb'),
    'secondary_color', COALESCE(secondary_color, '#16a34a'),
    'logo_url', logo_url,
    'school_name', name
  )
  INTO result
  FROM schools
  WHERE id = p_school_id;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- Allow anyone (including anon) to call this function
GRANT EXECUTE ON FUNCTION get_school_branding(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_school_branding(UUID) TO authenticated;
