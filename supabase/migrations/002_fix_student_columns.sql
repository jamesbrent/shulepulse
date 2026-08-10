-- Add updated_at column to students table for tracking edits
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
