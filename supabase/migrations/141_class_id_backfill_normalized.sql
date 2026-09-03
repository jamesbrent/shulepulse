-- ============================================================================
-- 141_class_id_backfill_normalized.sql
-- T2-4 follow-up: the original 138 backfill used an EXACT match of
--   classes.class_name = students.class
-- which matched 0 rows on live data because students.class stores title case
-- ('Grade 6') while classes.class_name stores uppercase ('GRADE 6') and one
-- row carries a trailing space ('Grade 7 ').
--
-- This is a re-backfill, idempotent + additive:
--   * column class_id (138) already exists            -> no-op via IF NOT EXISTS
--   * index  idx_students_class_id (138) exists       -> no-op via IF NOT EXISTS
--   * it only fills class_id where a NORMALIZED (trim + case-insensitive)
--     per-school match exists, and RAISE NOTICE every row left unmatched.
--
-- Per task rule: unmatched rows keep class_id = NULL (no data invented). The
-- 4 known-unmatchable students (Grade 9, 10, 11, PP2) have no classes row for
-- their school; consumer code must fall back to students.class for those.
-- ============================================================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

DO $$
DECLARE
  v_rec RECORD;
  v_matched_count BIGINT := 0;
  v_unmatched_count BIGINT := 0;
BEGIN
  FOR v_rec IN
    WITH missing AS (
      SELECT s.id AS student_id, s.school_id, s.class, s.admission_number
      FROM students s
      WHERE s.class_id IS NULL
        AND s.class IS NOT NULL
        AND btrim(s.class) <> ''
    )
    SELECT m.student_id, m.school_id, m.class, m.admission_number,
           c.id AS matched_class_id
    FROM missing m
    LEFT JOIN classes c
      ON c.school_id = m.school_id
     AND btrim(lower(c.class_name)) = btrim(lower(m.class))
    ORDER BY m.school_id, m.class, m.student_id
  LOOP
    IF v_rec.matched_class_id IS NOT NULL THEN
      UPDATE students
         SET class_id = v_rec.matched_class_id
       WHERE id = v_rec.student_id;
      v_matched_count := v_matched_count + 1;
    ELSE
      RAISE NOTICE 'UNMATCHED students.class_id backfill: school_id=%, student_id=%, admission_number=%, class=%',
        v_rec.school_id, v_rec.student_id, v_rec.admission_number, v_rec.class;
      v_unmatched_count := v_unmatched_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'students.class_id re-backfill (141) complete: % matched, % unmatched (logged above, class_id left NULL).',
    v_matched_count, v_unmatched_count;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);

-- Post-check: how many students with a non-empty class still have NULL class_id?
SELECT count(*) AS still_null_with_class
FROM students
WHERE class_id IS NULL
  AND class IS NOT NULL
  AND btrim(class) <> '';
