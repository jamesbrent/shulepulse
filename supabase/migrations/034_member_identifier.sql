-- Add KEMIS identifier column so schools using KEMIS (instead of NEMIS) can store it.
ALTER TABLE students ADD COLUMN IF NOT EXISTS kemis_number TEXT;
