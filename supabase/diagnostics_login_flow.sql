-- ═════════════════════════════════════════════════════════════════════════════
-- READ-ONLY: How login resolves for every user (auth users × identities × profiles)
-- Safe to run — SELECT only, no writes, no deletes.
-- Run in the Supabase SQL editor.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1) Every auth user, their email, and which auth provider(s) are linked to them.
--    A Gmail parent who signed up by PASSWORD first will have: provider = email
--    After migration 148 runs, that same account should ALSO have provider = google
--    (same user_id for both) — that is the "linked" success state.
SELECT
  u.id                                                          AS auth_user_id,
  u.email,
  u.created_at                                                  AS account_created,
  u.last_sign_in_at,
  COALESCE(string_agg(i.provider, ', ' ORDER BY i.provider), '(none)') AS providers,
  COALESCE(string_agg(i.provider_id, ', ' ORDER BY i.provider), '')     AS provider_ids
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
GROUP BY u.id, u.email, u.created_at, u.last_sign_in_at
ORDER BY u.email;

-- Result interpretation:
--   * "email" provider only    -> account created by password (createParentAuth/signUp).
--   * "google" provider only   -> the temporary profile-less Google user (bug path).
--   * "email, google" on SAME row -> LINKED correctly (migration 148 worked). This is what we want.
--   * A SEPARATE row with only "google" still existing -> linking did NOT complete.

-- 2) The same, joined to the application profile so you can see role/school/disabled.
--    This shows what Login.jsx will find when the user signs in.
SELECT
  u.email,
  u.id                                                          AS auth_user_id,
  COALESCE(string_agg(i.provider, ',' ORDER BY i.provider), '(none)') AS providers,
  p.id                                                          AS profile_id,
  p.role,
  p.school_id,
  p.disabled
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
LEFT JOIN public.profiles p ON p.id = u.id
GROUP BY u.email, u.id, p.id, p.role, p.school_id, p.disabled
ORDER BY u.email;

-- 3) Sanity: providers that have a Google identity but NO profile (would fall into
--    the 'no profile' branch of Login.jsx and rely on link_google_to_existing).
SELECT
  i.provider_id,
  u.email,
  u.id AS auth_user_id,
  p.id AS profile_id,
  p.role,
  p.school_id
FROM auth.identities i
JOIN auth.users u ON u.id = i.user_id
LEFT JOIN public.profiles p ON p.id = u.id
WHERE i.provider = 'google' AND p.id IS NULL
ORDER BY u.email;

-- 4) Confirm the fix function exists and who can call it.
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'link_google_to_existing';

-- 5) If you want to TEST the function without changing anything, run the SELECT
--    below (dry-run read of what the function WOULD target). It does NOT link.
--    Replace '<THE_GOOGLE_USER_EMAIL>' with the parent email that's failing.
--    It shows the existing (password) auth user that the Google identity WOULD
--    be linked into — if a row comes back, the link is safe and will work.
-- SELECT id, email
-- FROM auth.users
-- WHERE lower(email) = lower('<THE_GOOGLE_USER_EMAIL>')
--   AND id <> (SELECT id FROM auth.users WHERE email = '<THE_GOOGLE_USER_EMAIL>' LIMIT 1)
-- LIMIT 1;
