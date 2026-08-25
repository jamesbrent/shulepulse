-- 084_fix_avatar_and_grades.sql
-- Fix three issues:
-- 1. school-assets bucket was made private (078) but avatars/logos need public read
-- 2. grades RLS missing bursar/registrar/reception roles
-- 3. (authStore realtime fix is in JS, not SQL)

-- 1. Make school-assets public again — avatars and logos must be publicly visible
UPDATE storage.buckets SET public = true WHERE id = 'school-assets';

-- Ensure public read policy exists for avatars and logos
DROP POLICY IF EXISTS "school_assets_logos_read" ON storage.objects;
CREATE POLICY "school_assets_public_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] IN ('avatars', 'logos')
  );

-- 2. Fix grades RLS — add missing roles (bursar, registrar, reception)
DROP POLICY IF EXISTS "grades_staff_all" ON grades;
CREATE POLICY "grades_staff_all"
  ON grades FOR ALL
  USING (
    school_id = get_my_school_id()
    AND get_my_role() IN (
      'admin', 'teacher', 'hod', 'deputy_admin', 'class_teacher',
      'bursar', 'registrar', 'reception', 'superadmin'
    )
  );
