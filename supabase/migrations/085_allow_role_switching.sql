-- 085_allow_role_switching.sql
-- Fix: allow users to switch between their assigned roles
-- while still preventing escalation to unassigned roles

CREATE OR REPLACE FUNCTION deny_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Superadmin can do anything
    IF (SELECT role FROM profiles WHERE id = auth.uid()) = 'superadmin' THEN
      RETURN NEW;
    END IF;
    -- Allow switching between roles the user already has in their roles array
    IF NEW.role = ANY(COALESCE(OLD.roles, ARRAY[OLD.role]::text[])) THEN
      RETURN NEW;
    END IF;
    -- Block everything else (escalation)
    RAISE EXCEPTION 'Cannot modify your own role. Only superadmin can change roles.';
  END IF;
  RETURN NEW;
END;
$$;
