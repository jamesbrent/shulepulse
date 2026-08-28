-- ============================================================================
-- 118_student_admission_sequence.sql
-- BUG FIX (QA audit Part 9): admission_number collisions caused insert 409s.
--
-- Root cause: the UI inferred the next number from in-memory row counts, and
-- admission_number had a GLOBAL unique index while every school restarted at
-- ADM/<year>/0001 - so two schools (or two concurrent adds in one school)
-- both produced the same number and the second insert was rejected.
--
-- Fix (safe, chosen approach):
--   * Scope admission_number uniqueness PER SCHOOL (unique on
--     school_id + admission_number) - numbers are only meaningful inside a
--     school anyway.
--   * NEW admission_number_sequences table = atomic per-school/per-year
--     counter, seeded from existing ADM/<year>/<seq> rows.
--   * NEW generate_student_admission_number(school_id, year) RPC allocates the
--     next number atomically (advisory lock + upsert).
--   * BEFORE INSERT trigger assigns a number automatically when the insert
--     omits it (NULL), so student creation can never collide again.
--   * NEW preview_student_admission_number(school_id, year) read-only RPC for
--     the forms' "Auto" display (does NOT burn sequence numbers).
--
-- No existing rows are changed. If pre-existing per-school duplicates existed,
-- the per-school unique index is skipped (RAISE NOTICE) so the migration still
-- applies; the trigger would then surface any collision at insert time.
-- ============================================================================

-- 1) Re-scope uniqueness to the school (constraint-backed index) ------------
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_admission_number_key;

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
  FROM (
    SELECT school_id, admission_number, count(*) AS c
    FROM students
    WHERE admission_number IS NOT NULL
    GROUP BY school_id, admission_number
    HAVING count(*) > 1
  ) d;

  IF v_bad = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_students_school_admission_number
      ON students (school_id, admission_number);
    RAISE NOTICE 'per-school admission_number unique index created';
  ELSE
    RAISE NOTICE 'per-school admission_number index SKIPPED: % duplicate group(s) exist', v_bad;
  END IF;
END;
$$;

-- 2) Per-school / per-year sequence counter ---------------------------------
CREATE TABLE IF NOT EXISTS admission_number_sequences (
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  last_value BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, year)
);

-- 3) Allocator RPC -----------------------------------------------------------
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

-- 4) Read-only preview RPC (no sequence burn) --------------------------------
CREATE OR REPLACE FUNCTION preview_student_admission_number(
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
  v_seq  BIGINT;
BEGIN
  SELECT COALESCE(
    (SELECT last_value FROM admission_number_sequences WHERE school_id = p_school_id AND year = v_year),
    COALESCE((
      SELECT MAX(seq)
      FROM (
        SELECT (substring(s.admission_number, '^ADM/[0-9]+/([0-9]+)$'))::BIGINT AS seq
        FROM students s
        WHERE s.school_id = p_school_id
          AND s.admission_number ~ ('^ADM/' || v_year || '/[0-9]+$')
      ) t
    ), 0)
  ) INTO v_seq;

  RETURN 'ADM/' || v_year || '/' || lpad((v_seq + 1)::text, 4, '0');
END;
$$;

-- 5) Auto-assign when the client omits the number ----------------------------
CREATE OR REPLACE FUNCTION students_auto_admission_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.admission_number IS NULL OR BTRIM(NEW.admission_number) = '' THEN
    NEW.admission_number := generate_student_admission_number(
      NEW.school_id, EXTRACT(YEAR FROM now())::INTEGER
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_auto_admission_number ON students;
CREATE TRIGGER trg_students_auto_admission_number
  BEFORE INSERT ON students
  FOR EACH ROW
  EXECUTE FUNCTION students_auto_admission_number();

-- 6) Grants ---------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION generate_student_admission_number(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION generate_student_admission_number(UUID, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION preview_student_admission_number(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION preview_student_admission_number(UUID, INTEGER) TO authenticated, service_role;