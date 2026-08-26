-- Migration 088: Auto-seed core GL accounts for new schools + CBC subjects trigger
-- Fires AFTER INSERT on the `schools` table (same pattern as 057/045).

-- ============================================================================
-- 1. Auto-seed 6 core GL accounts for new schools
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_core_gl_accounts_for_new_school()
RETURNS trigger AS $$
DECLARE
  v_school UUID := NEW.id;
BEGIN
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE school_id = v_school LIMIT 1) THEN
    RETURN NEW;
  END IF;

  INSERT INTO chart_of_accounts (school_id, code, name, type, category, description)
  VALUES
    (v_school, '1010', 'Petty Cash',              'asset',  'Cash & Bank',         'Cash on hand'),
    (v_school, '1020', 'Cash at Bank (Main)',     'asset',  'Cash & Bank',         'Main bank account'),
    (v_school, '1030', 'Mobile Money Account',    'asset',  'Cash & Bank',         'M-Pesa / mobile money'),
    (v_school, '1040', 'Bank — Fixed Deposit',    'asset',  'Cash & Bank',         'Fixed deposits'),
    (v_school, '1110', 'Student Fee Receivables', 'asset',  'Accounts Receivable', 'Fees billed minus collected'),
    (v_school, '4010', 'Tuition Fees',            'income', 'Fee Income',          'Fee income recognised on billing');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_gl_accounts ON schools;
CREATE TRIGGER trg_seed_gl_accounts AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION seed_core_gl_accounts_for_new_school();

-- ============================================================================
-- 2. Auto-seed CBC subjects for new schools
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_cbc_subjects_for_new_school()
RETURNS trigger AS $$
BEGIN
  PERFORM seed_cbc_subjects(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_cbc_subjects ON schools;
CREATE TRIGGER trg_seed_cbc_subjects AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION seed_cbc_subjects_for_new_school();
