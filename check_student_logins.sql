SELECT 
  s.full_name,
  s.email AS student_email,
  s.admission_number,
  s.class,
  p.email AS auth_email,
  p.id AS auth_user_id
FROM students s
LEFT JOIN profiles p ON p.email = s.email AND p.role = 'student'
WHERE s.status = 'active'
ORDER BY s.class, s.full_name;
