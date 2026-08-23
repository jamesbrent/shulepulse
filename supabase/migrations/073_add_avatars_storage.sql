-- 073_add_avatars_storage.sql
-- Ensures the school-assets bucket exists for avatar uploads
-- Run this in Supabase SQL Editor

-- Insert bucket if it doesn't exist (school-assets is already used by LogoUploader)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload avatars
CREATE POLICY "Avatar upload for authenticated users"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'school-assets' AND (storage.foldername(name))[1] = 'avatars');

-- Allow public read access to avatars
CREATE POLICY "Avatar public read access"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'school-assets' AND (storage.foldername(name))[1] = 'avatars');

-- Allow users to update their own avatar
CREATE POLICY "Avatar update for owner"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'school-assets' AND (storage.foldername(name))[1] = 'avatars');

-- Allow users to delete their own avatar
CREATE POLICY "Avatar delete for owner"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'school-assets' AND (storage.foldername(name))[1] = 'avatars');
