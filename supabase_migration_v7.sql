-- ─── Fix existing grades with wrong teacher_id ───────────────────────────
-- grades.teacher_id has a FK to profiles(id) (auth user ID).
-- Some rows may have been stored with teachers.id instead of profiles.id.
-- This updates them to the correct profile ID by matching email+school.

UPDATE public.grades g
SET teacher_id = p.id
FROM public.teachers t
JOIN public.profiles p ON p.email = t.email AND p.school_id = t.school_id
WHERE g.teacher_id = t.id
  AND p.id IS DISTINCT FROM g.teacher_id;
