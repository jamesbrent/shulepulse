-- ============================================================================
-- 115_profiles_allow_registrar.sql
-- BUG FIX (QA audit Part 3): role switch to 'registrar' failed with 23514.
--
-- Root cause: two overlapping CHECK constraints on profiles.role.
--   profiles_role_check (migration 056)  -> includes 'registrar'
--   profiles_valid_role (migration 076)  -> omits 'registrar', adds 'nurse'
-- A direct UPDATE profiles SET role='registrar' violated the second CHECK.
--
-- Fix: drop the newer, narrower constraint. profiles_role_check already
-- covers every role the frontend uses (src/utils/roles.js includes registrar
-- and NOT nurse), so only the redundant constraint is removed. No data is
-- touched. Zero rows have role='nurse' in production.
--
-- Additive/safe: no data changes, no schema deletes other than the duplicate
-- CHECK. Idempotent via IF EXISTS.
-- ============================================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_valid_role;