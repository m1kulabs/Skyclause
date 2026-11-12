-- #608: no login may create temporary objects. pg_partman 5.1.0 puts pg_temp ahead of pg_catalog in the search path of the
-- functions partition_maintenance() runs as `owner` (5.4.1 gave each function its own; Neon offers only 5.1.0), and the
-- SECURITY DEFINER functions of 0004, 0005 and 0032 set `pg_catalog, public` without a trailing pg_temp. Postgres searches
-- the temporary schema first for relation names, so a temporary table or view of a login's own, named like a table such
-- a function reads without a schema, replaces it and runs the login's code as `owner`.
--
-- TEMPORARY comes from PUBLIC, and Postgres has no per-role refusal, so PUBLIC loses it and `owner` gets it back: pg_partman's
-- partition_data_time() and partition_data_id() make a temporary table. `migrator` keeps it as the database's owner; a
-- role made later gets none. Nothing in the repository creates a temporary object.
--
-- The grant is the database's own, which `owner` doesn't hold, so this runs as `migrator`, as 0004 does for partman's
-- schema; the database's name differs per environment (local, CI, Neon). A REVOKE by a role that doesn't own the database
-- only warns, and migrate() shows no warnings, so the migration fails, naming the roles, if any of them keeps the privilege.
RESET ROLE;
DO $$
DECLARE
  holders text;
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO "owner"', current_database());
  SELECT string_agg(rolname, ', ' ORDER BY rolname) INTO holders FROM pg_roles
    WHERE rolname IN ('system', 'app', 'auth_app', 'retention', 'public_reader')
      AND has_database_privilege(rolname, current_database(), 'TEMPORARY');
  IF holders IS NOT NULL THEN
    RAISE EXCEPTION 'TEMPORARY on database "%" is still held by %: the REVOKE takes effect only if the migrating role owns the database',
      current_database(), holders;
  END IF;
END
$$;
SET LOCAL ROLE "owner";
