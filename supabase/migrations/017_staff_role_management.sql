-- Add hod_department column to teachers table for HOD role tracking
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hod_department TEXT;

-- Ensure profiles role column supports all new roles
-- (The existing role column is TEXT so any value is accepted)
