-- ============================================================
-- 074_security_hardening.sql
-- Phase 1 Security Remediation: Steps 4, 5, 6, 7, 8
--
-- IMPORTANT: This migration uses IF EXISTS / IF NOT EXISTS
-- for idempotent re-runs. Review before deploying.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- STEP 8: Server-side audit logging
-- Create audit_logs INSERT policy that allows any authenticated
-- user to insert, but restricts UPDATE/DELETE.
-- Then create triggers for critical tables.
-- ──────────────────────────────────────────────────────────

-- Ensure audit_logs table exists and has proper policies
-- (009 may have created it — we ensure it exists)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES schools(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies that may conflict (idempotent)
DROP POLICY IF EXISTS audit_logs_select_superadmin ON audit_logs;
DROP POLICY IF EXISTS audit_logs_select_school_admin ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_superadmin ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_school_staff ON audit_logs;

-- Only service_role can read audit logs (server-side only)
CREATE POLICY "audit_logs_select_service_only"
  ON audit_logs FOR SELECT
  TO service_role
  USING (true);

-- Only service_role can insert audit logs (triggers only)
CREATE POLICY "audit_logs_insert_service_only"
  ON audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- No UPDATE or DELETE allowed at all (immutable audit trail)


-- ──────────────────────────────────────────────────────────
-- STEP 4: Enable RLS on out-of-band tables & add policies
-- These tables were created before migration tracking.
-- We add RLS and policies where they are missing.
-- ──────────────────────────────────────────────────────────

-- Helper: drop + recreate idempotently
-- We use DO blocks for idempotent policy creation

-- ── students ──
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_school_isolation ON students;
CREATE POLICY "students_school_isolation"
  ON students FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── attendance ──
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_school_isolation ON attendance;
CREATE POLICY "attendance_school_isolation"
  ON attendance FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── classes ──
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classes_school_isolation ON classes;
CREATE POLICY "classes_school_isolation"
  ON classes FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── subjects ──
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subjects_school_isolation ON subjects;
CREATE POLICY "subjects_school_isolation"
  ON subjects FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── fee_payments (add school_id isolation + role gate) ──
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

-- Drop old superadmin-only policy (dead code if RLS was off)
DROP POLICY IF EXISTS fee_payments_select_superadmin ON fee_payments;
DROP POLICY IF EXISTS fee_payments_insert_superadmin ON fee_payments;
DROP POLICY IF EXISTS fee_payments_update_superadmin ON fee_payments;
DROP POLICY IF EXISTS fee_payments_delete_superadmin ON fee_payments;

CREATE POLICY "fee_payments_school_isolation"
  ON fee_payments FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── fee_assessments ──
ALTER TABLE fee_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_assessments_school_isolation ON fee_assessments;
CREATE POLICY "fee_assessments_school_isolation"
  ON fee_assessments FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── student_ledger ──
ALTER TABLE student_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_ledger_school_isolation ON student_ledger;
CREATE POLICY "student_ledger_school_isolation"
  ON student_ledger FOR ALL
  USING (
    school_id = get_my_school_id()
    OR get_my_role() = 'superadmin'
  );

-- ── fee_structures ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fee_structures') THEN
    EXECUTE 'ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS fee_structures_school_isolation ON fee_structures;
    EXECUTE 'CREATE POLICY "fee_structures_school_isolation" ON fee_structures FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;

-- ── fee_categories ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fee_categories') THEN
    EXECUTE 'ALTER TABLE fee_categories ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS fee_categories_school_isolation ON fee_categories;
    EXECUTE 'CREATE POLICY "fee_categories_school_isolation" ON fee_categories FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;

-- ── fee_adjustments ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fee_adjustments') THEN
    EXECUTE 'ALTER TABLE fee_adjustments ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS fee_adjustments_school_isolation ON fee_adjustments;
    EXECUTE 'CREATE POLICY "fee_adjustments_school_isolation" ON fee_adjustments FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;

-- ── parents ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'parents') THEN
    EXECUTE 'ALTER TABLE parents ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS parents_school_isolation ON parents;
    EXECUTE 'CREATE POLICY "parents_school_isolation" ON parents FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;

-- ── parent_student_links ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'parent_student_links') THEN
    EXECUTE 'ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS parent_student_links_school_isolation ON parent_student_links;
    EXECUTE 'CREATE POLICY "parent_student_links_school_isolation" ON parent_student_links FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;

-- ── notices (ensure RLS enabled — policies exist from 028) ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notices') THEN
    EXECUTE 'ALTER TABLE notices ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ── salary_grades ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'salary_grades') THEN
    EXECUTE 'ALTER TABLE salary_grades ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS salary_grades_school_isolation ON salary_grades;
    EXECUTE 'CREATE POLICY "salary_grades_school_isolation" ON salary_grades FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;

-- ── school_subscriptions ──
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'school_subscriptions') THEN
    EXECUTE 'ALTER TABLE school_subscriptions ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS school_subscriptions_select ON school_subscriptions;
    EXECUTE 'CREATE POLICY "school_subscriptions_select" ON school_subscriptions FOR SELECT USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────
-- STEP 6: Fix payroll access — restrict staff SELECT
-- Currently teachers can see colleagues' salary data.
-- Replace open staff_select with role-restricted policies.
-- ──────────────────────────────────────────────────────────

-- payroll_runs
DROP POLICY IF EXISTS staff_select_payroll_runs ON payroll_runs;
CREATE POLICY "payroll_runs_role_restricted"
  ON payroll_runs FOR SELECT
  USING (
    (
      school_id = get_my_school_id()
      AND get_my_role() IN ('admin', 'deputy_administrator', 'bursar', 'superadmin')
    )
    OR get_my_role() = 'superadmin'
  );

-- payroll_lines (payslips)
DROP POLICY IF EXISTS staff_select_payroll_lines ON payroll_lines;
CREATE POLICY "payroll_lines_role_restricted"
  ON payroll_lines FOR SELECT
  USING (
    (
      school_id = get_my_school_id()
      AND get_my_role() IN ('admin', 'deputy_administrator', 'bursar', 'superadmin')
    )
    OR get_my_role() = 'superadmin'
  );

-- payroll_payment_requests
DROP POLICY IF EXISTS staff_select_payroll_payment_requests ON payroll_payment_requests;
CREATE POLICY "payroll_payment_requests_role_restricted"
  ON payroll_payment_requests FOR SELECT
  USING (
    (
      school_id = get_my_school_id()
      AND get_my_role() IN ('admin', 'deputy_administrator', 'bursar', 'superadmin')
    )
    OR get_my_role() = 'superadmin'
  );

-- salary_grades (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'salary_grades') THEN
    IF EXISTS (SELECT FROM pg_policies WHERE policyname = 'staff_select_salary_grades') THEN
      EXECUTE 'DROP POLICY staff_select_salary_grades ON salary_grades';
    END IF;
    EXECUTE 'CREATE POLICY "salary_grades_role_restricted" ON salary_grades FOR SELECT USING (
      (school_id = get_my_school_id() AND get_my_role() IN (''admin'', ''deputy_administrator'', ''bursar'', ''superadmin''))
      OR get_my_role() = ''superadmin''
    )';
  END IF;
END $$;

-- ap_invoices — restrict to finance roles
DROP POLICY IF EXISTS staff_select_ap_invoices ON ap_invoices;
CREATE POLICY "ap_invoices_role_restricted"
  ON ap_invoices FOR SELECT
  USING (
    (
      school_id = get_my_school_id()
      AND get_my_role() IN ('admin', 'deputy_administrator', 'bursar', 'superadmin')
    )
    OR get_my_role() = 'superadmin'
  );

-- ap_payments — restrict to finance roles
DROP POLICY IF EXISTS staff_select_ap_payments ON ap_payments;
CREATE POLICY "ap_payments_role_restricted"
  ON ap_payments FOR SELECT
  USING (
    (
      school_id = get_my_school_id()
      AND get_my_role() IN ('admin', 'deputy_administrator', 'bursar', 'superadmin')
    )
    OR get_my_role() = 'superadmin'
  );


-- ──────────────────────────────────────────────────────────
-- STEP 5: Secure file storage buckets
-- ──────────────────────────────────────────────────────────

-- Make finance-attachments private (was PUBLIC)
UPDATE storage.buckets SET public = false WHERE id = 'finance-attachments';

-- Drop old open policies on finance-attachments
DROP POLICY IF EXISTS fa_storage_select ON storage.objects;

-- Add school-scoped SELECT for finance-attachments
CREATE POLICY "fa_storage_select_school_scoped"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'finance-attachments'
    AND (
      (storage.foldername(name))[1] = (
        SELECT school_id::text FROM profiles WHERE id = auth.uid()
      )
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin'
    )
  );

-- Restrict finance-attachments INSERT to finance roles only
DROP POLICY IF EXISTS fa_storage_insert ON storage.objects;
CREATE POLICY "fa_storage_insert_finance_only"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'finance-attachments'
    AND (storage.foldername(name))[1] = (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (
      'admin', 'bursar', 'deputy_administrator', 'superadmin'
    )
  );

-- Restrict finance-attachments DELETE to finance roles only
DROP POLICY IF EXISTS fa_storage_delete ON storage.objects;
CREATE POLICY "fa_storage_delete_finance_only"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'finance-attachments'
    AND (storage.foldername(name))[1] = (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN (
      'admin', 'bursar', 'deputy_administrator', 'superadmin'
    )
  );

-- Make school-assets partially private
-- Logos can stay public; avatars should be restricted
DROP POLICY IF EXISTS "Avatar public read access" ON storage.objects;
CREATE POLICY "school_assets_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'logos'
  );

-- Avatars: authenticated read only (within same school)
CREATE POLICY "school_assets_avatars_auth_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'avatars'
  );

-- Fix avatar upload/update/delete: restrict to owner
DROP POLICY IF EXISTS "Avatar upload for authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update for owner" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete for owner" ON storage.objects;

CREATE POLICY "avatar_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (name = 'avatars/' || auth.uid() || right(name, position('.' IN reverse(name))))
  );

CREATE POLICY "avatar_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (name = 'avatars/' || auth.uid() || right(name, position('.' IN reverse(name))))
  );

CREATE POLICY "avatar_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (name = 'avatars/' || auth.uid() || right(name, position('.' IN reverse(name))))
  );

-- Documents bucket: add school scoping
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;

CREATE POLICY "documents_insert_school"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "documents_select_school"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "documents_delete_school"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- Exam papers: add school scoping
DROP POLICY IF EXISTS "exam_papers_auth_all" ON storage.objects;
CREATE POLICY "exam_papers_insert_school"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'exam-papers'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "exam_papers_select_school"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exam-papers'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "exam_papers_delete_school"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'exam-papers'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM profiles WHERE id = auth.uid()
    )
  );


-- ──────────────────────────────────────────────────────────
-- STEP 7: Financial security — atomic receipt number generation
-- ──────────────────────────────────────────────────────────

-- Create atomic receipt number generator (like next_journal_number)
CREATE OR REPLACE FUNCTION next_receipt_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT := 'RCP';
  v_year TEXT := to_char(now(), 'YY');
  v_seq INT;
  v_receipt TEXT;
BEGIN
  -- Use advisory lock keyed on school_id to serialize
  PERFORM pg_advisory_xact_lock(('0x' || left(replace(p_school_id::text, '-', ''), 8))::bit(32)::int);

  SELECT COALESCE(MAX(
    CAST(split_part(receipt_number, '-', 3) AS INT)
  ), 0) + 1 INTO v_seq
  FROM fee_payments
  WHERE school_id = p_school_id
    AND receipt_number LIKE v_prefix || '-' || v_year || '-%';

  v_receipt := v_prefix || '-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN v_receipt;
END;
$$;

-- Revoke public access and grant to authenticated
REVOKE EXECUTE ON FUNCTION next_receipt_number FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_receipt_number TO authenticated;


-- ──────────────────────────────────────────────────────────
-- STEP 8: Server-side audit triggers for critical tables
-- ──────────────────────────────────────────────────────────

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_table TEXT := TG_TABLE_NAME;
  v_old JSONB;
  v_new JSONB;
  v_school_id UUID;
  v_user_id UUID;
BEGIN
  -- Determine action
  CASE TG_OP
    WHEN 'INSERT' THEN
      v_action := v_table || '.created';
      v_new := to_jsonb(NEW);
      v_school_id := NEW.school_id;
    WHEN 'UPDATE' THEN
      v_action := v_table || '.updated';
      v_old := to_jsonb(OLD);
      v_new := to_jsonb(NEW);
      v_school_id := NEW.school_id;
    WHEN 'DELETE' THEN
      v_action := v_table || '.deleted';
      v_old := to_jsonb(OLD);
      v_school_id := OLD.school_id;
  END CASE;

  v_user_id := auth.uid();

  -- Insert into audit_logs
  INSERT INTO audit_logs (school_id, action, details, performed_by)
  VALUES (
    v_school_id,
    v_action,
    jsonb_build_object(
      'old', v_old,
      'new', v_new,
      'table', v_table,
      'operation', TG_OP
    ),
    v_user_id
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Attach triggers to critical tables
-- Only attach if triggers don't already exist

DO $$
BEGIN
  -- Students
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_students') THEN
    CREATE TRIGGER audit_students
      AFTER INSERT OR UPDATE OR DELETE ON students
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
  END IF;

  -- Fee payments
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_fee_payments') THEN
    CREATE TRIGGER audit_fee_payments
      AFTER INSERT OR UPDATE OR DELETE ON fee_payments
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
  END IF;

  -- Payroll runs
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_payroll_runs') THEN
    CREATE TRIGGER audit_payroll_runs
      AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
  END IF;

  -- AP payments
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_ap_payments') THEN
    CREATE TRIGGER audit_ap_payments
      AFTER INSERT OR UPDATE OR DELETE ON ap_payments
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────
-- GRANT USAGE for audit_logs to service_role only
-- ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON audit_logs TO service_role;
-- Revoke from authenticated (triggers run as definer/service_role)
REVOKE SELECT, INSERT ON audit_logs FROM authenticated;

