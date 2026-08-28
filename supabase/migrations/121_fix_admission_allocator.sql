-- ============================================================================
-- 121_fix_admission_allocator.sql
-- Corrects a first-allocation off-by-one in generate_student_admission_number
-- from migration 118: fresh allocations returned MAX(existing) instead of
-- MAX(existing)+1 and would have collided with the existing highest number.
-- The corrected body reads the starting point under the advisory lock and
-- always inserts/increments by one. Idempotent CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_student_admission_number(
  p_school_id UUID,
  p_year      INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM now())::INTEGER);
  v_base BIGINT;
  v_seq  BIGINT;
BEGIN
  -- Serialize concurrent allocation per school inside the caller transaction.
  PERFORM pg_advisory_xact_lock(hashtext('adm:' || p_school_id::text));

  -- Starting point: continue from the sequence row if present, otherwise from
  -- the highest ADM/<year>/<seq> already stored for this school.
  SELECT COALESCE(
    (SELECT last_value FROM admission_number_sequences
     WHERE school_id = p_school_id AND year = v_year),
    COALESCE((
      SELECT MAX(seq)
      FROM (
        SELECT (substring(s.admission_number, '^ADM/[0-9]+/([0-9]+)$'))::BIGINT AS seq
        FROM students s
        WHERE s.school_id = p_school_id
          AND s.admission_number ~ ('^ADM/' || v_year || '/[0-9]+$')
      ) t
    ), 0)
  ) INTO v_base;

  -- Allocate the next number: fresh row starts at v_base + 1, existing rows
  -- keep incrementing (never reuses numbers, monotonic under the lock).
  INSERT INTO admission_number_sequences (school_id, year, last_value)
  VALUES (p_school_id, v_year, v_base + 1)
  ON CONFLICT (school_id, year)
  DO UPDATE SET last_value = admission_number_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'ADM/' || v_year || '/' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_student_admission_number(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION generate_student_admission_number(UUID, INTEGER) TO authenticated, service_role;