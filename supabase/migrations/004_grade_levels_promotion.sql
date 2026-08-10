-- ─────────────────────────────────────────────────────────────────────────────
-- Grade Levels + Atomic Promotion
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. grade_levels — defines ordered class progression per school
CREATE TABLE IF NOT EXISTS grade_levels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  promotion_order   INTEGER NOT NULL,
  is_final          BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (school_id, name),
  UNIQUE (school_id, promotion_order)
);

ALTER TABLE grade_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grade_levels_school_isolation"
  ON grade_levels
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- 2. Seed defaults from existing student class values
INSERT INTO grade_levels (school_id, name, promotion_order, is_final)
SELECT DISTINCT
  s.school_id,
  v.name,
  v.ord,
  v.is_final
FROM students s
CROSS JOIN (VALUES
  ('PP1',       1,  false),
  ('PP2',       2,  false),
  ('Grade 1',  3,  false),
  ('Grade 2',  4,  false),
  ('Grade 3',  5,  false),
  ('Grade 4',  6,  false),
  ('Grade 5',  7,  false),
  ('Grade 6',  8,  false),
  ('Grade 7',  9,  false),
  ('Grade 8', 10,  false),
  ('Grade 9', 11,  false),
  ('Grade 10',12,  false),
  ('Grade 11',13,  false),
  ('Grade 12',14,  true )
) AS v(name, ord, is_final)
WHERE s.class IS NOT NULL
ON CONFLICT (school_id, name) DO NOTHING;

-- 3. RPC: promote students atomically
CREATE OR REPLACE FUNCTION promote_students(
  p_school_id UUID,
  p_student_ids UUID[],
  p_promoted_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now       TIMESTAMPTZ := now();
  v_promoted  JSONB;
  v_grade     RECORD;
  v_student   RECORD;
  v_errors    TEXT[] := '{}';
  v_count     INT := 0;
BEGIN
  -- Loop each student so we can skip those at final grade
  FOR v_student IN
    SELECT s.id, s.class, gl.name AS next_class
    FROM students s
    LEFT JOIN grade_levels gl_current ON gl_current.school_id = p_school_id AND gl_current.name = s.class
    LEFT JOIN grade_levels gl_next ON gl_next.school_id = p_school_id AND gl_next.promotion_order = gl_current.promotion_order + 1
    WHERE s.id = ANY(p_student_ids)
      AND s.school_id = p_school_id
  LOOP
    IF v_student.next_class IS NULL THEN
      v_errors := array_append(v_errors, format('Student %s (%s) at final grade "%s"', v_student.id, v_student.class, v_student.class));
      CONTINUE;
    END IF;

    UPDATE students
      SET class = v_student.next_class,
          updated_at = v_now,
          updated_by = p_promoted_by
      WHERE id = v_student.id;

    INSERT INTO promotion_history (school_id, student_id, from_class, to_class, promoted_by, promoted_at)
      VALUES (p_school_id, v_student.id, v_student.class, v_student.next_class, p_promoted_by, v_now);

    v_count := v_count + 1;
  END LOOP;

  v_promoted := jsonb_build_object(
    'promoted', v_count,
    'errors',   CASE WHEN array_length(v_errors, 1) > 0 THEN to_jsonb(v_errors) ELSE '[]'::jsonb END
  );

  RETURN v_promoted;
END;
$$;
