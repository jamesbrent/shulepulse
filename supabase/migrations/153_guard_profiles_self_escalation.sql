-- Migration 153: Guard profiles self-service escalation
--
-- Closes the own-row UPDATE escape hatch found during the RBAC/onboarding
-- audit. profiles_update_own policy lets a user UPDATE their own row with no
-- column restriction, so any signed-in user could change their own school_id
-- (jump into another tenant) or append roles (e.g. add 'admin' to their roles
-- array) directly through PostgREST.
--
-- Trigger is intentionally NOT SECURITY DEFINER so current_user reflects the
-- effective caller (same pattern as guard_schools_subscription_change/099):
--   * SECURITY DEFINER RPCs (switch_school, create_school_admin_user, ...) run
--     as postgres and their internal UPDATEs pass.
--   * A direct authenticated/service_role write to own school_id/roles is
--     rejected.
--
-- Only fires on UPDATE OF school_id, roles -- daily edits (team, deadlines,
-- feel, classrooms, classes) do NOT fire it and keep their current policies.

CREATE OR REPLACE FUNCTION guard_profiles_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Changing your own school is not allowed directly; use switch_school.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    RAISE EXCEPTION 'Modifying your own roles is not allowed directly.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_self_escalation ON profiles;
CREATE TRIGGER trg_guard_profiles_self_escalation
  BEFORE UPDATE OF school_id, roles ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profiles_self_escalation();