-- Add branding columns to the schools table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/oywptkvlztswblfchvyo/sql/new)

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#16a34a',
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Add guardians column to the students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS guardians jsonb DEFAULT '[]'::jsonb;
