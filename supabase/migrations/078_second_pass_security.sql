-- ============================================================
-- 078_second_pass_security.sql
-- Second-pass security audit fixes: CRITICAL + HIGH
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- VULN-31 (CRITICAL): Prevent role escalation
-- Any user can currently UPDATE profiles.role on their own row
-- via profiles_update_own policy (no column restriction).
-- This trigger blocks non-superadmin role changes.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deny_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) != 'superadmin' THEN
      RAISE EXCEPTION 'Cannot modify your own role. Only superadmin can change roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_role_escalation ON profiles;
CREATE TRIGGER trg_deny_role_escalation
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION deny_role_escalation();

-- ──────────────────────────────────────────────────────────
-- VULN-39: Restrict schools INSERT to superadmin only
-- ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS schools_insert_superadmin ON schools;
CREATE POLICY "schools_insert_superadmin"
  ON schools FOR INSERT
  WITH CHECK (get_my_role() = 'superadmin');

-- ──────────────────────────────────────────────────────────
-- VULN-40: Enable RLS on journal_number_counters
-- ──────────────────────────────────────────────────────────
ALTER TABLE journal_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jnc_select"
  ON journal_number_counters FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');

CREATE POLICY "jnc_insert"
  ON journal_number_counters FOR INSERT
  WITH CHECK (school_id = get_my_school_id() OR get_my_role() = 'superadmin');

CREATE POLICY "jnc_update"
  ON journal_number_counters FOR UPDATE
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');

-- ──────────────────────────────────────────────────────────
-- VULN-41: Drop stale profiles_update_superadmin from M011
-- ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_update_superadmin ON profiles;

-- ──────────────────────────────────────────────────────────
-- VULN-37: Replace fee_payments/fee_assessments/student_ledger
-- FOR ALL policies with role-gated write policies.
-- Currently ANY staff role can delete/modify payments.
-- ──────────────────────────────────────────────────────────

-- fee_payments: admin/bursar/deputy can write; delete admin only
DROP POLICY IF EXISTS fee_payments_school_isolation ON fee_payments;
CREATE POLICY "fee_payments_select"
  ON fee_payments FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "fee_payments_insert_role_gated"
  ON fee_payments FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "fee_payments_update_role_gated"
  ON fee_payments FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "fee_payments_delete_admin_only"
  ON fee_payments FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- fee_assessments: admin/bursar/deputy can write
DROP POLICY IF EXISTS fee_assessments_school_isolation ON fee_assessments;
CREATE POLICY "fee_assessments_select"
  ON fee_assessments FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "fee_assessments_insert_role_gated"
  ON fee_assessments FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "fee_assessments_update_role_gated"
  ON fee_assessments FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "fee_assessments_delete_admin_only"
  ON fee_assessments FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- student_ledger: admin/bursar can write
DROP POLICY IF EXISTS student_ledger_school_isolation ON student_ledger;
CREATE POLICY "student_ledger_select"
  ON student_ledger FOR SELECT
  USING (school_id = get_my_school_id() OR get_my_role() = 'superadmin');
CREATE POLICY "student_ledger_insert_role_gated"
  ON student_ledger FOR INSERT
  WITH CHECK (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'deputy_administrator', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "student_ledger_update_role_gated"
  ON student_ledger FOR UPDATE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'bursar', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );
CREATE POLICY "student_ledger_delete_admin_only"
  ON student_ledger FOR DELETE
  USING (
    (school_id = get_my_school_id() AND get_my_role() IN ('admin', 'superadmin'))
    OR get_my_role() = 'superadmin'
  );

-- ──────────────────────────────────────────────────────────
-- VULN-42: Fix policy name mismatches
-- M075 tried to drop non-existent names; old permissive ALL policies survive
-- ──────────────────────────────────────────────────────────

-- non_teaching_staff: drop the old permissive ALL policy by correct name
DROP POLICY IF EXISTS "Staff see own school non_teaching_staff" ON non_teaching_staff;
-- M075's role-gated policies already exist and are correct

-- departments: drop the old permissive ALL policy by correct name
DROP POLICY IF EXISTS "departments_same_school" ON departments;
-- M075's role-gated policies already exist and are correct

-- ──────────────────────────────────────────────────────────
-- VULN-43: Fix views leaking cross-tenant data
-- Add security_invoker to views so they respect caller's RLS
-- ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS teacher_names CASCADE;
CREATE VIEW teacher_names
  WITH (security_invoker = true)
  AS SELECT id, school_id, full_name, role
  FROM profiles
  WHERE role IN ('teacher', 'hod', 'class_teacher', 'deputy_administrator', 'admin');

DROP VIEW IF EXISTS parent_names CASCADE;
CREATE VIEW parent_names
  WITH (security_invoker = true)
  AS SELECT id, school_id, full_name, role
  FROM profiles
  WHERE role = 'parent';

DROP VIEW IF EXISTS students_without_logins CASCADE;
CREATE VIEW students_without_logins
  WITH (security_invoker = true)
  AS SELECT s.id, s.full_name, s.admission_number, s.school_id, s.email
  FROM students s
  WHERE s.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.id);

-- ──────────────────────────────────────────────────────────
-- VULN-44: Block payroll recalculation of posted/approved runs
-- Add a trigger that prevents status changes on completed runs
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_posted_payroll modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('posted', 'paid') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Cannot modify status of a % payroll run', OLD.status;
  END IF;
  IF OLD.status IN ('posted', 'paid') AND NEW.totals IS DISTINCT FROM OLD.totals THEN
    RAISE EXCEPTION 'Cannot modify totals of a % payroll run', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_posted_payroll ON payroll_runs;
CREATE TRIGGER trg_protect_posted_payroll
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_payroll modification();

-- ──────────────────────────────────────────────────────────
-- VULN-46: Server-side approval enforcement
-- Add triggers to prevent self-approval on expenses and AP
-- ──────────────────────────────────────────────────────────

-- Expense self-approval prevention
CREATE OR REPLACE FUNCTION deny_self_approval_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by = NEW.created_by THEN
    RAISE EXCEPTION 'Cannot approve your own expense';
  END IF;
  IF NEW.status IN ('posted', 'paid') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status NOT IN ('approved') THEN
      RAISE EXCEPTION 'Expense must be approved before posting/paying';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_self_approval_expenses ON expenses;
CREATE TRIGGER trg_deny_self_approval_expenses
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION deny_self_approval_expenses();

-- AP invoice self-approval prevention
CREATE OR REPLACE FUNCTION deny_self_approval_ap_invoices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by = NEW.created_by THEN
    RAISE EXCEPTION 'Cannot approve your own invoice';
  END IF;
  IF NEW.status IN ('posted', 'paid') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status NOT IN ('approved') THEN
      RAISE EXCEPTION 'Invoice must be approved before posting/paying';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_self_approval_ap_invoices ON ap_invoices;
CREATE TRIGGER trg_deny_self_approval_ap_invoices
  BEFORE UPDATE ON ap_invoices
  FOR EACH ROW
  EXECUTE FUNCTION deny_self_approval_ap_invoices();

-- AP payment self-approval prevention
CREATE OR REPLACE FUNCTION deny_self_approval_ap_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by = NEW.created_by THEN
    RAISE EXCEPTION 'Cannot approve your own payment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deny_self_approval_ap_payments ON ap_payments;
CREATE TRIGGER trg_deny_self_approval_ap_payments
  BEFORE UPDATE ON ap_payments
  FOR EACH ROW
  EXECUTE FUNCTION deny_self_approval_ap_payments();

-- ──────────────────────────────────────────────────────────
-- VULN-47: Make school-assets bucket private
-- ──────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'school-assets' AND public = true;

-- Add signed-URL SELECT policy for logos (public read)
DROP POLICY IF EXISTS school_assets_public_read ON storage.objects;
CREATE POLICY "school_assets_logos_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'school-assets'
    AND (name LIKE 'logos/%' OR name LIKE 'avatars/%')
  );

-- ──────────────────────────────────────────────────────────
-- VULN-50: Enable RLS on out-of-band tables
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'grading_systems', 'grading_bands', 'exam_type_config',
      'student_payments', 'fee_adjustments', 'receipt_sequences',
      'cheque_tracking', 'bank_transfers'
    ])
  LOOP
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      -- Add school-isolation FOR ALL policy if none exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = t AND policyname LIKE '%school%'
      ) THEN
        EXECUTE format(
          'CREATE POLICY "%s_school_isolation" ON %I FOR ALL USING (school_id = get_my_school_id() OR get_my_role() = ''superadmin'')',
          t, t
        );
      END IF;
    END IF;
  END LOOP;
END $$;
