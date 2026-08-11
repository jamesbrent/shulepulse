-- ════════════════════════════════════════════════════════════════════════
-- 032_COPY_CODE_RANDOM
-- Replaces the sequential accession codes (GHS/000001) with random
-- per-school codes (e.g. GHS-8F3K2Q) so they are not guessable.
-- Codes stay unique within each school (UNIQUE(school_id, copy_code)).
-- Existing copies keep their current codes; only new codes are random.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.next_book_copy_codes(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.next_book_copy_codes(p_prefix TEXT, p_count INTEGER)
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_school_id UUID;
  v_code TEXT;
  v_i INTEGER;
  v_j INTEGER;
  v_attempts INTEGER;
BEGIN
  -- Codes must be unique per school, so resolve the caller's school.
  SELECT school_id INTO v_school_id FROM profiles WHERE id = auth.uid();
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school found for current user';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _new_copy_codes(code TEXT);
  TRUNCATE _new_copy_codes;

  FOR v_i IN 1..p_count LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      v_code := upper(p_prefix) || '-';
      FOR v_j IN 1..6 LOOP
        v_code := v_code ||
          substring(v_chars FROM (1 + floor(random() * length(v_chars))::int) FOR 1);
      END LOOP;
      EXIT WHEN v_attempts >= 50 OR (
        NOT EXISTS (
          SELECT 1 FROM library_book_copies c
          WHERE c.school_id = v_school_id AND c.copy_code = v_code
        )
        AND NOT EXISTS (
          SELECT 1 FROM _new_copy_codes t WHERE t.code = v_code
        )
      );
    END LOOP;
    INSERT INTO _new_copy_codes(code) VALUES (v_code);
  END LOOP;

  RETURN QUERY SELECT t.code FROM _new_copy_codes t;
END;
$$;

REVOKE ALL ON FUNCTION public.next_book_copy_codes(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_book_copy_codes(TEXT, INTEGER) TO authenticated;
