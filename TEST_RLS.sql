-- Test: can a teacher insert into grades? (run as service_role to simulate)
-- First check what teacher account you're testing
SELECT id, email, full_name, role, school_id FROM profiles WHERE role = 'teacher' LIMIT 1;

-- Check RLS is actually enabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname = 'grades';

-- Test direct insert as a specific teacher (replace UUID with actual teacher id)
-- This won't work from SQL Editor (runs as service_role), but will show if constraint issues exist
INSERT INTO grades (school_id, student_id, subject, exam_type, term, year, total_score, class_name, grade, teacher_id, teacher_name, status)
SELECT
  s.school_id,
  s.id,
  'Test',
  'CAT 1',
  'Term 2',
  2026,
  50,
  s.class,
  'C',
  (SELECT id FROM profiles WHERE role = 'teacher' AND school_id = s.school_id LIMIT 1),
  'Test Teacher',
  'draft'
FROM students s
WHERE s.school_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Clean up test data
DELETE FROM grades WHERE subject = 'Test' AND teacher_name = 'Test Teacher';
