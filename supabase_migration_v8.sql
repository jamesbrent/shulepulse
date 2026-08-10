-- Add teacher_name column to grades table for audit trail / display
-- This is a denormalized copy of the teacher's full_name at submission time

ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS teacher_name text DEFAULT '';

-- Backfill existing grades with teacher names from profiles
UPDATE public.grades g
SET teacher_name = COALESCE(p.full_name, '')
FROM public.profiles p
WHERE g.teacher_id = p.id
  AND (g.teacher_name IS NULL OR g.teacher_name = '');
