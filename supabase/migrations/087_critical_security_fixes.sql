-- Migration 087: Critical Security Fixes
-- Addresses: C1 (cross-school revenue leak), H8 (storage policy school scoping)

-- ============================================================================
-- C1: Fix get_monthly_revenue() — Cross-School Data Leak
-- Original function queried ALL fee_payments across ALL schools with no filter
-- ============================================================================

CREATE OR REPLACE FUNCTION get_monthly_revenue()
RETURNS TABLE(month text, amount numeric)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    to_char(transaction_date, 'Mon') || ' ' || to_char(transaction_date, 'YY') AS month,
    COALESCE(SUM(amount), 0)::numeric AS amount
  FROM fee_payments
  WHERE transaction_date IS NOT NULL
    AND school_id = get_my_school_id()
  GROUP BY to_char(transaction_date, 'Mon YY'), date_trunc('month', transaction_date)
  ORDER BY date_trunc('month', transaction_date) ASC;
$$;

-- Grant to authenticated users only (not anon)
REVOKE ALL ON FUNCTION get_monthly_revenue() FROM anon;
GRANT EXECUTE ON FUNCTION get_monthly_revenue() TO authenticated;

-- ============================================================================
-- H8: Fix Storage Policies — Add School Scoping
-- Current policies allow any authenticated user to upload to any school's folder
-- ============================================================================

-- Drop the overly broad insert policies
DROP POLICY IF EXISTS logo_insert_school ON storage.objects;
DROP POLICY IF EXISTS teacher_photo_insert_school ON storage.objects;

-- Re-create with proper school_id validation
CREATE POLICY logo_insert_school ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'school-assets'
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = get_my_school_id()::text
);

CREATE POLICY teacher_photo_insert_school ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'school-assets'
  AND (storage.foldername(name))[1] = 'teacher-photos'
  AND (storage.foldername(name))[2] = get_my_school_id()::text
);

-- Also fix the read policy to be school-scoped (currently allows reading ALL schools' assets)
DROP POLICY IF EXISTS school_assets_logos_read ON storage.objects;

CREATE POLICY school_assets_logos_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'school-assets'
  AND (
    -- Users can read their own school's assets
    (storage.foldername(name))[2] = get_my_school_id()::text
    -- Superadmins can read all school assets
    OR get_my_role() = 'superadmin'
  )
);

-- ============================================================================
-- Additional: Secure get_monthly_revenue with proper grant/revoke
-- ============================================================================

-- Ensure the function is not callable by anonymous users
REVOKE ALL ON FUNCTION get_monthly_revenue() FROM public;
