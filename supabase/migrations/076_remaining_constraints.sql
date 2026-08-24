-- ============================================================
-- 076_remaining_constraints.sql
-- Database-level validation constraints
-- ============================================================

-- Email format validation on profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_email_format'
    AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_email_format
      CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');
  END IF;
END $$;

-- Role whitelist constraint on profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_valid_role'
    AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_valid_role
      CHECK (role IN (
        'superadmin', 'admin', 'deputy_administrator',
        'teacher', 'hod', 'class_teacher',
        'bursar', 'librarian', 'reception', 'parent', 'student', 'nurse'
      ));
  END IF;
END $$;

-- Numeric-only phone validation on profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_phone_format'
    AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_phone_format
      CHECK (phone IS NULL OR phone ~ '^[0-9+\-\s()]{7,20}$');
  END IF;
END $$;

-- Ensure fee_payments.amount is positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fee_payments_positive_amount'
    AND conrelid = 'fee_payments'::regclass
  ) THEN
    ALTER TABLE fee_payments
      ADD CONSTRAINT fee_payments_positive_amount
      CHECK (amount > 0);
  END IF;
END $$;

-- Ensure student_payments.amount is positive (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'student_payments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'student_payments_positive_amount'
      AND conrelid = 'student_payments'::regclass
    ) THEN
      ALTER TABLE student_payments
        ADD CONSTRAINT student_payments_positive_amount
        CHECK (amount > 0);
    END IF;
  END IF;
END $$;
