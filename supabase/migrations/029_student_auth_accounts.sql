-- Migration: Ensure students can log in by creating auth accounts
-- Run the "Create All Logins" button in Admin > Students or Registrar > Admissions
-- This adds default password: Student@123

-- Add index on students.email for faster login lookups
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);

-- Add index on profiles.email for login matching
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- View to identify students missing auth accounts (run in SQL Editor to check)
CREATE OR REPLACE VIEW students_without_logins AS
SELECT s.id, s.full_name, s.email, s.admission_number, s.class, s.school_id
FROM students s
LEFT JOIN profiles p ON p.email = s.email AND p.role = 'student'
WHERE s.email IS NOT NULL
  AND s.email != ''
  AND p.id IS NULL
  AND s.status = 'active';
