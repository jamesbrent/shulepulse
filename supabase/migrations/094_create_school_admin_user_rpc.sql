-- Migration 094: Stored procedure for creating school admin accounts directly
-- Eliminates client-side signup email rate limits on Free Tier.

CREATE OR REPLACE FUNCTION create_school_admin_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_school_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_caller_role text;
BEGIN
  -- Security: Only superadmin can create admin accounts
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmin can create admin accounts';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  -- Check if user exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Update existing auth user
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'role', 'admin', 'school_id', p_school_id),
      updated_at = now()
    WHERE id = v_user_id;

    -- Upsert profile
    INSERT INTO public.profiles (id, email, full_name, role, roles, school_id, disabled)
    VALUES (v_user_id, lower(trim(p_email)), p_full_name, 'admin', ARRAY['admin']::text[], p_school_id, false)
    ON CONFLICT (id) DO UPDATE
    SET
      full_name = EXCLUDED.full_name,
      role = 'admin',
      roles = ARRAY['admin']::text[],
      school_id = p_school_id,
      disabled = false;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'action', 'updated');
  ELSE
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(trim(p_email)),
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'role', 'admin', 'school_id', p_school_id),
      false,
      now(),
      now()
    );

    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      role,
      roles,
      school_id,
      disabled
    ) VALUES (
      v_user_id,
      lower(trim(p_email)),
      p_full_name,
      'admin',
      ARRAY['admin']::text[],
      p_school_id,
      false
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = 'admin',
      roles = ARRAY['admin']::text[],
      school_id = p_school_id,
      disabled = false;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'action', 'created');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_school_admin_user(text, text, text, uuid) TO authenticated;
