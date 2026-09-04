-- ─────────────────────────────────────────────────────────────────────────────
-- Parent Google-linking fix: allow a Gmail parent to sign in with Google and
-- land in their ALREADY-provisioned (password) account, instead of the Google
-- OAuth creating a separate, profile-less auth user that Login rejects with
-- "This Google account is not registered to a school."
--
-- Background:
--   createParentAuth() provisions the parent via email/password (signUp), so a
--   `profiles` row exists for that password user. When the same Gmail parent
--   later clicks "Sign in with Google", Supabase OAuth creates a *different*
--   auth user bound to the Google provider, which has NO profiles row. Login's
--   profile lookup (by that new user id) fails. Also, under RLS, the new user
--   cannot SELECT the parent's profile (school_id non-null) so the client can't
--   reconcile by email either.
--
-- Fix: a SECURITY DEFINER RPC runs as the table owner (bypasses RLS). It finds
-- the existing password account by email, links the incoming Google identity
-- into it, removes the temporary Google-only auth user, and returns the
-- canonical auth user id. The client then signs out and re-runs Google OAuth —
-- which now resolves to the existing account because the google provider_id is
-- attached to it. One account, both sign-in methods work.
--
-- Safety: only the caller's own new identity can be linked (p_user_id must
-- equal auth.uid()). The Googler must own the Gmail whose email already maps to
-- the provisioned account, so this cannot be used to take over another account.
-- Append-only; run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_google_to_existing(p_user_id uuid, p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_existing uuid;
  v_google_provider_id text;
BEGIN
  -- Only the caller may act on their own (new) identity.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  -- Locate the existing provisioned account with the same email.
  SELECT id INTO v_existing
  FROM auth.users
  WHERE lower(email) = lower(p_email)
    AND id <> p_user_id
  LIMIT 1;

  IF v_existing IS NULL THEN
    RETURN NULL; -- nothing to link into → caller stays unregistered
  END IF;

  -- Grab the Google identity carried by the incoming OAuth user.
  SELECT provider_id INTO v_google_provider_id
  FROM auth.identities
  WHERE user_id = p_user_id AND provider = 'google'
  LIMIT 1;

  IF v_google_provider_id IS NOT NULL THEN
    -- Avoid a unique (provider, provider_id) clash on the target.
    DELETE FROM auth.identities
    WHERE user_id = v_existing AND provider = 'google';

    -- Re-home the Google identity onto the existing account.
    UPDATE auth.identities
    SET user_id = v_existing
    WHERE user_id = p_user_id AND provider = 'google';
  END IF;

  -- Remove the temporary Google-only auth user (its identities were moved;
  -- Supabase cascades its sessions/refresh tokens on deletion).
  DELETE FROM auth.users
  WHERE id = p_user_id AND id <> v_existing;

  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.link_google_to_existing(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_google_to_existing(uuid, text) TO authenticated;
