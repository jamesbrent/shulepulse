-- ============================================================================
-- 116_subjects_duplicate_guard.sql
-- BUG FIX (QA audit Part 5): duplicate subjects could be inserted, and the
-- CBC seed function creates legitimately distinct subjects that share codes
-- across levels (REL, KIS, SCI, PST/PTS, MAT/MATH). Merging is destructive and
-- wrong, so we only PREVENT FUTURE duplicates on (school_id, curriculum_level,
-- name), case/whitespace-insensitive, and leave all existing rows untouched.
--
-- Enforcement:
--   1. BEFORE INSERT/UPDATE trigger -> hard rejection for any writer, robust
--      against NULL curriculum_level and whitespace/case variance.
--   2. Unique expression index -> defense in depth, created ONLY when no
--      pre-existing rows violate it (otherwise the migration still applies and
--      the trigger keeps enforcing). No data is modified or deleted.
--
-- Relationships (timetable_slots, teacher_subject_assignments,
-- class_subject_assignments) all reference subjects.id and are untouched.
-- ============================================================================

-- 1) Trigger guard -----------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_subjects_duplicates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM subjects
    WHERE school_id = NEW.school_id
      AND curriculum_level IS NOT DISTINCT FROM NEW.curriculum_level
      AND LOWER(BTRIM(name)) = LOWER(BTRIM(NEW.name))
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Subject "%" already exists for level "%" in this school.',
      BTRIM(NEW.name), COALESCE(NEW.curriculum_level, 'all')
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subjects_duplicate_guard ON subjects;
CREATE TRIGGER trg_subjects_duplicate_guard
  BEFORE INSERT OR UPDATE OF school_id, curriculum_level, name ON subjects
  FOR EACH ROW
  EXECUTE FUNCTION guard_subjects_duplicates();

-- 2) Unique index (only if existing data is clean) ---------------------------
DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
  FROM (
    SELECT school_id, curriculum_level,
           LOWER(BTRIM(name)) AS norm_name,
           count(*) AS c
    FROM subjects
    GROUP BY school_id, curriculum_level, LOWER(BTRIM(name))
    HAVING count(*) > 1
  ) d;

  IF v_bad = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_subjects_school_level_name
      ON subjects (school_id, curriculum_level, LOWER(BTRIM(name)));
    RAISE NOTICE 'subjects unique index created';
  ELSE
    RAISE NOTICE 'subjects unique index SKIPPED: % existing duplicate group(s); trigger still enforces future inserts', v_bad;
  END IF;
END;
$$;