-- Migration 090: Create legal-documents storage bucket
-- Allows superadmin to upload reviewed legal document PDFs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-documents', 'legal-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow superadmins to upload
CREATE POLICY "Superadmins can upload legal documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'legal-documents'
    AND get_my_role() = 'superadmin'
  );

-- Allow anyone to read (public bucket)
CREATE POLICY "Public read access for legal documents"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'legal-documents');

-- Allow superadmins to update (replace files)
CREATE POLICY "Superadmins can update legal documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND get_my_role() = 'superadmin'
  );

-- Allow superadmins to delete
CREATE POLICY "Superadmins can delete legal documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND get_my_role() = 'superadmin'
  );
