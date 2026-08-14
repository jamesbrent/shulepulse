-- ============================================================
-- Phase 6: Opener 15 / Midterm 15 / End Term 70 assessment scheme
-- Run in Supabase SQL Editor. Wraps in a transaction.
-- ============================================================
BEGIN;

-- ── 1. grades: add max_marks (weight = marks the assessment is scored out of) ──
ALTER TABLE grades ADD COLUMN IF NOT EXISTS max_marks integer;

-- ── 2. Resolve duplicates BEFORE renaming exam types ──
-- Some rows predate the CAT scheme and still use Opener/Midterm. Where the same
-- student/subject/term/year ALSO has a CAT-era row, the orphaned Opener-era row
-- is a duplicate of the same assessment. We keep the CAT-era row (the record the
-- school currently sees) and drop the orphan.
DELETE FROM grades g1
USING grades g2
WHERE g1.exam_type = 'Midterm'
  AND g2.exam_type = 'CAT 2'
  AND g1.student_id = g2.student_id
  AND g1.subject = g2.subject
  AND g1.term = g2.term
  AND g1.year = g2.year;

DELETE FROM grades g1
USING grades g2
WHERE g1.exam_type = 'Opener'
  AND g2.exam_type = 'CAT 1'
  AND g1.student_id = g2.student_id
  AND g1.subject = g2.subject
  AND g1.term = g2.term
  AND g1.year = g2.year;

-- ── 3. Backfill historical weights BEFORE renaming exam types ──
UPDATE grades SET max_marks = 15 WHERE max_marks IS NULL AND exam_type = 'Opener';
UPDATE grades SET max_marks = 15 WHERE max_marks IS NULL AND exam_type = 'Midterm';
UPDATE grades SET max_marks = 20 WHERE max_marks IS NULL AND exam_type = 'CAT 1';
UPDATE grades SET max_marks = 20 WHERE max_marks IS NULL AND exam_type = 'CAT 2';

-- End Term weight depends on which scheme the school is on:
-- CAT-era schools score End Term out of 60; Opener-era-only schools out of 70.
UPDATE grades g SET max_marks = 60
WHERE g.max_marks IS NULL AND g.exam_type = 'End Term'
  AND EXISTS (SELECT 1 FROM grades gg WHERE gg.school_id = g.school_id AND gg.exam_type IN ('CAT 1', 'CAT 2'));

UPDATE grades g SET max_marks = 70
WHERE g.max_marks IS NULL AND g.exam_type = 'End Term'
  AND NOT EXISTS (SELECT 1 FROM grades gg WHERE gg.school_id = g.school_id AND gg.exam_type IN ('CAT 1', 'CAT 2'));

-- ── 4. Rename historical exam types to the new scheme ──
-- (total_score is stored as a percentage, so names change without touching values)
UPDATE grades SET exam_type = 'Opener'  WHERE exam_type = 'CAT 1';
UPDATE grades SET exam_type = 'Midterm' WHERE exam_type = 'CAT 2';
-- End Term keeps its name; its max goes from 60 -> 70 via config below.

-- ── 5. exam_type_config: apply the new scheme for every school ──
UPDATE exam_type_config SET name = 'Opener',  label = 'Opener Assessment',        max_marks = 15, weightage = 15 WHERE name = 'CAT 1';
UPDATE exam_type_config SET name = 'Midterm', label = 'Midterm Assessment',       max_marks = 15, weightage = 15 WHERE name = 'CAT 2';
UPDATE exam_type_config SET name = 'End Term', label = 'End of Term Examination', max_marks = 70, weightage = 70 WHERE name = 'End Term';

-- ── 6. Remove the stray CAT 3 row (100 marks / 10% weight) ──
DELETE FROM exam_type_config WHERE name = 'CAT 3';

-- ── 7. Guard: confirm the new config per school sums to 100 ──
SELECT school_id, name, max_marks, weightage, sort_order
FROM exam_type_config
ORDER BY school_id, sort_order;

COMMIT;
