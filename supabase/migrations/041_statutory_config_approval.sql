-- ════════════════════════════════════════════════════════════════════════
-- 041_STATUTORY_CONFIG_APPROVAL
-- Statutory rate changes (PAYE, NSSF, SHIF, Housing Levy, NITA) follow the
-- same admin-approval discipline as payroll run approval:
--
--   • A bursar's edit is saved with status = 'pending' and only becomes
--     effective once an admin / principal approves it.
--   • Admins may save directly with status = 'approved' (immediate effect).
--   • getStatutoryConfig() ignores pending/rejected rows when computing pay.
--
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE payroll_statutory_config
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_by  UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;

-- Existing rows (including the 039 seed) become 'approved' automatically via
-- the column default; nothing further needed.
