-- ================================================================
-- 114_delete_school_diagnostic.sql
-- READ-ONLY DIAGNOSTIC — source of: "DELETE requires a WHERE clause"
-- Safe to run in Supabase SQL Editor.
-- No INSERT/UPDATE/DELETE/DDL anywhere — SELECT only.
--
-- KEY POINT: PostgreSQL itself can never produce "DELETE requires a
-- WHERE clause". That exact string is emitted by the PostgREST HTTP
-- gateway when a client sends a DELETE on a *table endpoint* with no
-- filter. Any function/trigger/RPC in the DB executes its own SQL and
-- cannot trigger that message. Section 7 proves the DB side is clean.
-- ================================================================


-- ---------- SECTION 1: full definition of public.delete_school ---
SELECT n.nspname AS schema_name,
       p.proname  AS function_name,
       pg_get_function_arguments(p.oid)                AS arguments,
       p.prosecdef                                     AS security_definer,
       p.provolatile                                   AS volatility,
       p.prosrc                                        AS source_code
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'delete_school';


-- ---------- SECTION 2: triggers attached to public.schools ------
SELECT c.relname             AS table_name,
       t.tgname              AS trigger_name,
       pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class     c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname  = 'schools'
  AND NOT t.tgisinternal;


-- ---------- SECTION 3: tables that carry a school_id column -----
-- (every table whose rows a school deletion could touch)
SELECT n.nspname AS schema_name,
       cl.relname AS table_name,
       cl.relkind
FROM pg_attribute a
JOIN pg_class     cl ON cl.oid = a.attrelid
JOIN pg_namespace n  ON n.oid  = cl.relnamespace
WHERE a.attname = 'school_id'
  AND n.nspname = 'public'
  AND cl.relkind IN ('r','p','v','m')
ORDER BY cl.relname;


-- ---------- SECTION 4: triggers on all of those tables ----------
WITH affected AS (
  SELECT cl.oid AS relid
  FROM pg_attribute a
  JOIN pg_class     cl ON cl.oid = a.attrelid
  JOIN pg_namespace n  ON n.oid  = cl.relnamespace
  WHERE a.attname = 'school_id'
    AND n.nspname = 'public'
    AND cl.relkind IN ('r','p')
)
SELECT c.relname AS table_name,
       t.tgname  AS trigger_name,
       p.proname AS function_name,
       pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class     c ON c.oid = t.tgrelid
JOIN affected    af ON af.relid = t.tgrelid
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- ---------- SECTION 5: definitions of those trigger functions ----
WITH affected AS (
  SELECT cl.oid AS relid
  FROM pg_attribute a
  JOIN pg_class     cl ON cl.oid = a.attrelid
  JOIN pg_namespace n  ON n.oid  = cl.relnamespace
  WHERE a.attname = 'school_id'
    AND n.nspname = 'public'
    AND cl.relkind IN ('r','p')
)
SELECT DISTINCT p.proname AS function_name,
                pg_get_functiondef(p.oid) AS definition
FROM pg_trigger t
JOIN pg_proc     p ON p.oid = t.tgfoid
JOIN affected   af ON af.relid = t.tgrelid
WHERE NOT t.tgisinternal
ORDER BY p.proname;


-- ---------- SECTION 6: every public function containing a DELETE --
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ~* 'delete\s+from'
ORDER BY p.proname;


-- ---------- SECTION 7: the actual DELETE statements + verdict ----
-- THE column that matters: 'verdict'.
-- Anything marked '** NO WHERE CLAUSE **' would purge a whole table
-- (note: PostgreSQL executes it happily — it is NOT this error string).
WITH funcs AS (
  SELECT n.nspname AS schema_name,
         p.proname AS function_name,
         p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~* 'delete\s+from'
)
SELECT f.schema_name,
       f.function_name,
       m.match[1] AS delete_statement,
       CASE WHEN m.match[1] ~* '\ywhere\y' THEN 'FILTERED'
            ELSE '** NO WHERE CLAUSE **' END AS verdict
FROM funcs f
CROSS JOIN LATERAL regexp_matches(f.prosrc, 'delete[^;]*;', 'gi') AS m(match)
WHERE m.match[1] ~* 'from'
ORDER BY verdict, f.schema_name, f.function_name;


-- ---------- SECTION 8: functions delete_school calls ------------
-- Resolves identifiers immediately followed by '(' inside the
-- delete_school body, then flags whether that target has any DELETE.
WITH src AS (
  SELECT prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'delete_school'
),
calls AS (
  SELECT DISTINCT m[1] AS called
  FROM src
  CROSS JOIN LATERAL regexp_matches(src.prosrc,
        '([a-z_][a-z0-9_]*)\s*\(', 'gi') AS m(match)
)
SELECT c.called AS called_function,
       (p.proname IS NOT NULL) AS is_public_function,
       (p.prosrc ~* 'delete\s+from') AS contains_delete
FROM calls c
LEFT JOIN pg_proc     p ON p.proname = c.called
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
ORDER BY c.called;


-- ---------- SECTION 9: FKs involving schools ---------------------
-- on_delete_behavior shows whether cascades COULD fire (the RPC
-- drops constraints first, so they won't — shown for completeness).
SELECT child_ns.nspname  || '.' || child_rel.relname   AS child_table,
       parent_ns.nspname || '.' || parent_rel.relname  AS parent_table,
       pg_get_constraintdef(c.oid) AS constraint_def,
       CASE c.confdeltype
         WHEN 'c' THEN 'ON DELETE CASCADE'
         WHEN 'a' THEN 'ON DELETE NO ACTION'
         WHEN 'r' THEN 'ON DELETE RESTRICT'
         WHEN 'n' THEN 'ON DELETE SET NULL'
         WHEN 'd' THEN 'ON DELETE SET DEFAULT'
       END AS on_delete_behavior,
       c.conname AS constraint_name
FROM pg_constraint c
JOIN pg_class     child_rel  ON child_rel.oid  = c.conrelid
JOIN pg_namespace child_ns   ON child_ns.oid   = child_rel.relnamespace
JOIN pg_class     parent_rel ON parent_rel.oid = c.confrelid
JOIN pg_namespace parent_ns  ON parent_ns.oid  = parent_rel.relnamespace
WHERE c.contype = 'f'
  AND ( (parent_rel.oid = 'public.schools'::regclass AND child_ns.nspname = 'public')
     OR (child_rel.oid  = 'public.schools'::regclass) )
ORDER BY child_table, parent_table;