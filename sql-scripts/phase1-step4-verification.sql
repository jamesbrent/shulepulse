-- ═══════════════════════════════════════════════════════════════
-- Phase 1 STEP 4: VERIFICATION — normalization changed ONLY the
-- grade string. All four counts must be 0.
-- ═══════════════════════════════════════════════════════════════

SELECT 'total_score_changed' AS check_name, COUNT(*) AS value
FROM grades g JOIN grades_normalize_backup b ON b.id = g.id
WHERE g.total_score IS DISTINCT FROM b.total_score

UNION ALL SELECT 'status_changed', COUNT(*)
FROM grades g JOIN grades_normalize_backup b ON b.id = g.id
WHERE g.status IS DISTINCT FROM b.status

UNION ALL SELECT 'any_other_field_changed', COUNT(*)
FROM grades g JOIN grades_normalize_backup b ON b.id = g.id
WHERE g.subject IS DISTINCT FROM b.subject
   OR g.exam_type IS DISTINCT FROM b.exam_type
   OR g.student_id IS DISTINCT FROM b.student_id
   OR g.term IS DISTINCT FROM b.term
   OR g.year IS DISTINCT FROM b.year
   OR g.class_name IS DISTINCT FROM b.class_name
   OR g.teacher_id IS DISTINCT FROM b.teacher_id
   OR g.teacher_name IS DISTINCT FROM b.teacher_name
   OR g.cbe_band IS DISTINCT FROM b.cbe_band
   OR g.performance_level IS DISTINCT FROM b.performance_level
   OR g.remarks IS DISTINCT FROM b.remarks
   OR g.submitted_at IS DISTINCT FROM b.submitted_at

UNION ALL SELECT 'null_points_8level', COUNT(*)
FROM grades WHERE grade IN ('EE1','EE2','ME1','ME2','AE1','AE2','BE1','BE2') AND points IS NULL;
