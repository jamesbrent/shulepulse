-- ─────────────────────────────────────────────────────────────────────────────
-- U7 cleanup: remove 4 stray teacher profiles (no school, no teacher record)
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
-- The U7 reconciliation diagnostic found these profiles with role='teacher',
-- school_id IS NULL and NO matching teachers / non_teaching_staff row. They
-- are un-attached (test/seed artifacts). This removes the orphan auth accounts.
-- Jane Mwangi is intentionally NOT touched (she has a real teachers row).
-- Idempotent: only deletes rows matching all guards; safe to re-run.

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Collect exactly the orphan profiles (email match + no school + no staff link);
  -- skip any that have since gained a school or a staff record.
  SELECT array_agg(p.id) INTO v_ids
  FROM profiles p
  WHERE lower(p.email) IN (
          lower('icmimediadpt@gmail.com'),
          lower('blessedjoseph064@gmail.com'),
          lower('clockcheck@null.local'),
          lower('clockprobe_1788328146454@null.local')
        )
    AND p.school_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM teachers t WHERE t.profile_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM non_teaching_staff n WHERE n.profile_id = p.id);

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE NOTICE 'U7 cleanup: no matching orphan teacher-profiles to remove';
    RETURN;
  END IF;

  RAISE NOTICE 'U7 cleanup: removing % orphan teacher-profile(s)', array_length(v_ids, 1);

  -- delete order mirrors delete_user(): identities -> profiles -> auth.users
  DELETE FROM auth.identities WHERE user_id = ANY(v_ids);
  DELETE FROM profiles WHERE id = ANY(v_ids);
  DELETE FROM auth.users WHERE id = ANY(v_ids);
END;
$$;
