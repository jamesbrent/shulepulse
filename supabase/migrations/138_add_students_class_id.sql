-- T2-4: Introduce a proper FK from students -> classes.
--
-- History: `students.class` is a free-form TEXT column holding values like
-- 'Grade 6', while the `classes` table (created outside tracked migrations,
-- used by timetable_slots / class_subject_requirements) also stores
-- `class_name` per school. The app already queries `student.class_id`
-- (e.g. StudentPortal.jsx:178, StudentProfile.jsx:38), so we add the FK column,
-- backfill it from a per-school match of students.class = classes.class_name,
-- and LOG (via RAISE NOTICE, NOT silent skip) every row that fails to match.
--
-- This migration is idempotent and additive: it only sets class_id where a
-- normalized (trim + case-insensitive) per-school match exists because
-- students.class stores title case ('Grade 6') while classes.class_name stores
-- uppercase ('GRADE 6') and may carry stray whitespace. Unmatched rows keep
-- class_id = NULL and are reported so they can be reviewed/fixed by a human
-- before consumers rely on class_id.

-- Step 1: add the nullable FK column (no-op if it already exists on live DB)
ALTER TABLE students ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- Step 2: backfill class_id from classes.class_name, matched within the SAME
-- school, and log every row that fails to match.
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

  RAISE NOTICE 'students.class_id backfill complete: % matched, % unmatched (logged above, class_id left NULL).',
    v_matched_count, v_unmatched_count;
END $$;

-- Supporting index for class-scoped student lookups
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
