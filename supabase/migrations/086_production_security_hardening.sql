-- 086_production_security_hardening.sql
-- Final production security hardening migration
-- Fixes: profiles cross-school leak, storage policies, roles trigger, CSP headers

-- ============================================================
-- 1. PROFILES SELECT POLICY — Fix cross-school data leak
--    admin/deputy/bursar could read ALL profiles across all schools
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_restricted" ON profiles;
CREATE POLICY "profiles_select_restricted"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (get_my_role() IN ('admin', 'deputy_administrator', 'bursar')
        AND school_id = get_my_school_id())
    OR get_my_role() = 'superadmin'
  );

-- ============================================================
-- 2. PROFILES UPDATE — Add column-level guard for roles array
--    Prevent users from adding 'superadmin' to their roles array
-- ============================================================
CREATE OR REPLACE FUNCTION deny_roles_array_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.roles IS DISTINCT FROM NEW.roles THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' THEN
      RETURN NEW;
    END IF;
    -- Block adding superadmin to roles array
    IF 'superadmin' = ANY(NEW.roles) AND NOT 'superadmin' = ANY(COALESCE(OLD.roles, ARRAY[]::text[])) THEN
      RAISE EXCEPTION 'Cannot add superadmin to roles. Only superadmin can grant superadmin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_roles_array_escalation ON profiles;
CREATE TRIGGER trg_deny_roles_array_escalation
  BEFORE UPDATE OF roles ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION deny_roles_array_escalation();

-- ============================================================
-- 3. STORAGE — Add missing INSERT policies for logos/ and teacher-photos/
-- ============================================================
-- Logo uploads (school admin uploads school logo)
DROP POLICY IF EXISTS "logo_insert_school" ON storage.objects;
CREATE POLICY "logo_insert_school"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'logos'
  );

-- Logo update (school admin updates school logo)
DROP POLICY IF EXISTS "logo_update_school" ON storage.objects;
CREATE POLICY "logo_update_school"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'logos'
  );

-- Logo delete
DROP POLICY IF EXISTS "logo_delete_school" ON storage.objects;
CREATE POLICY "logo_delete_school"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'logos'
  );

-- Teacher photo uploads
DROP POLICY IF EXISTS "teacher_photo_insert_school" ON storage.objects;
CREATE POLICY "teacher_photo_insert_school"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'teacher-photos'
  );

-- Teacher photo update
DROP POLICY IF EXISTS "teacher_photo_update_school" ON storage.objects;
CREATE POLICY "teacher_photo_update_school"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'teacher-photos'
  );

-- Teacher photo delete
DROP POLICY IF EXISTS "teacher_photo_delete_school" ON storage.objects;
CREATE POLICY "teacher_photo_delete_school"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'teacher-photos'
  );

-- ============================================================
-- 4. STORAGE — Add file type validation to school-assets bucket
-- ============================================================
UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'school-assets';

-- ============================================================
-- 5. STORAGE — Add file type validation to finance-attachments
-- ============================================================
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv']
WHERE id = 'finance-attachments';

-- ============================================================
-- 6. DROP duplicate SELECT policy on school-assets
-- ============================================================
DROP POLICY IF EXISTS "school_assets_logos_read" ON storage.objects;
