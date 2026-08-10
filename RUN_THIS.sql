ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS teacher_name text DEFAULT '';

UPDATE public.grades g
SET teacher_name = COALESCE(p.full_name, '')
FROM public.profiles p
WHERE g.teacher_id = p.id
  AND (g.teacher_name IS NULL OR g.teacher_name = '');
