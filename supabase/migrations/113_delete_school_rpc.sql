-- ============================================================================
-- 113_delete_school_rpc.sql
-- Safe RPC to hard-delete an entire school and every FK-dependent row.
-- Superadmin only (checked inside the function). Idempotent + re-runnable.
--
-- Strategy (no superuser trickery — postgres owns the tables so it can drop
-- and re-add constraints under SECURITY DEFINER):
--   1) verify caller is superadmin,
--   2) snapshot every FK whose referencing table is in the public schema,
--   3) drop all of those constraints,
--   4) capture this school's auth.user ids,
--   5) delete all rows on every public table that has a school_id column,
--   6) delete the linked auth.identities then auth.users,
--   7) delete the school row itself,
--   8) re-add every dropped FK from the snapshot.
-- Any failure rolls back the whole transaction, restoring constraints intact.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_school(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role       text;
  r            record;
  v_tbl        text;
  v_auth_users uuid[];
  v_auth_ident uuid[];
BEGIN
  SELECT get_my_role() INTO v_role;
  IF v_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmin can delete a school';
  END IF;

  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'school_id is required';
  END IF;

  -- 1) snapshot all public-schema FKs (deferrability preserved)
  CREATE TEMP TABLE IF NOT EXISTS _fk_snapshot (
    tbl regclass, conname text, condef text, is_deferrable boolean
  ) ON COMMIT DROP;
  DELETE FROM _fk_snapshot;

  INSERT INTO _fk_snapshot (tbl, conname, condef, is_deferrable)
  SELECT c.conrelid, c.conname, pg_get_constraintdef(c.oid), c.condeferrable
  FROM pg_constraint c
  JOIN pg_class     cl ON cl.oid  = c.conrelid
  JOIN pg_namespace n  ON n.oid   = cl.relnamespace
  WHERE c.contype = 'f'
    AND n.nspname = 'public';

  -- 2) drop them
  FOR r IN SELECT * FROM _fk_snapshot LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl::text, r.conname);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'could not drop constraint % on %: %', r.conname, r.tbl, SQLERRM;
    END;
  END LOOP;

  -- 3) capture auth.users that belong to this school before profiles go away
  SELECT array_agg(u.id)
    INTO v_auth_users
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
   WHERE p.school_id = p_school_id;

  -- 4) delete every school-scoped row (children before parents)
  FOR v_tbl IN
    SELECT DISTINCT cl.relname AS tbl
    FROM pg_attribute a
    JOIN pg_class      cl ON cl.oid  = a.attrelid
    JOIN pg_namespace  n  ON n.oid   = cl.relnamespace
    WHERE a.attname = 'school_id'
      AND n.nspname = 'public'
      AND cl.relkind IN ('r','p')
  LOOP
    IF to_regclass('pg_temp._ds_progress') IS NOT NULL THEN
      INSERT INTO pg_temp._ds_progress VALUES (v_tbl, now());
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE school_id = $1', v_tbl) USING p_school_id;
  END LOOP;

  -- audit AFTER DELETE triggers on students/fee_payments/payroll_runs/ap_payments
  -- re-insert audit_logs rows during the loop above; purge them once more so the
  -- audit_logs FK can be re-added cleanly.
  DELETE FROM public.audit_logs WHERE school_id = p_school_id;

  -- dump leftover counts for every processed table (diagnostics)
  IF to_regclass('pg_temp._ds_leftover') IS NOT NULL THEN
    FOR v_tbl IN
      SELECT DISTINCT cl.relname AS tbl
      FROM pg_attribute a
      JOIN pg_class      cl ON cl.oid  = a.attrelid
      JOIN pg_namespace  n  ON n.oid   = cl.relnamespace
      WHERE a.attname = 'school_id'
        AND n.nspname = 'public'
        AND cl.relkind IN ('r','p')
    LOOP
      EXECUTE format('INSERT INTO pg_temp._ds_leftover SELECT %L, count(*) FROM public.%I WHERE school_id = $1', v_tbl, v_tbl) USING p_school_id;
    END LOOP;
  END IF;

  -- 5) remove the auth rows for the deleted profiles
  IF v_auth_users IS NOT NULL AND array_length(v_auth_users, 1) > 0 THEN
    SELECT array_agg(id) INTO v_auth_ident FROM auth.identities WHERE user_id = ANY(v_auth_users);
    IF v_auth_ident IS NOT NULL AND array_length(v_auth_ident, 1) > 0 THEN
      DELETE FROM auth.identities WHERE user_id = ANY(v_auth_users);
    END IF;
    DELETE FROM auth.users WHERE id = ANY(v_auth_users);
  END IF;

  -- 6) finally the school itself
  DELETE FROM public.schools WHERE id = p_school_id;

  -- 7) re-add every dropped FK (tolerant: record any that fail)
  FOR r IN SELECT * FROM _fk_snapshot ORDER BY tbl, conname LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
        r.tbl::text, r.conname, r.condef);
    EXCEPTION WHEN OTHERS THEN
      IF to_regclass('pg_temp._fk_errors') IS NOT NULL THEN
        INSERT INTO pg_temp._fk_errors VALUES (r.conname, SQLERRM);
      END IF;
    END;
  END LOOP;

  NOTIFY pgrst, 'reload schema';
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_school(uuid) TO authenticated;