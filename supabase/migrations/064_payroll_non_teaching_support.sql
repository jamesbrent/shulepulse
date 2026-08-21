-- Migration 064: Allow non-teaching staff in payroll without a user profile
-- Makes profile_id nullable on payroll_employees and adds direct_name column
-- so non-teaching staff from non_teaching_staff table can be paid through payroll.

ALTER TABLE payroll_employees ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS direct_name TEXT;
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS nts_id UUID REFERENCES non_teaching_staff(id) ON DELETE SET NULL;
