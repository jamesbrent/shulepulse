-- Check unique constraints on grades table
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'grades'::regclass
  AND contype = 'u';

-- Check if teacher_name column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'grades' AND column_name = 'teacher_name';
