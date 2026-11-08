-- #79 §3 roles. Runs as the `migrator` login (src/migrate.ts); every later migration runs as `owner`.
-- In production `app`, `auth_app`, `system` and `retention` are logins Terraform makes as `migrator` (#89, #219), and
-- locally docker/init.sql makes them; this only creates what's missing, without LOGIN. `owner` owns every object and
-- `public_reader` is what `withPublicReader` switches to on the `app` login.
DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['owner', 'public_reader', 'app', 'auth_app', 'system', 'retention'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', name);
    END IF;
  END LOOP;
END
$$;

GRANT "owner" TO migrator WITH INHERIT TRUE, SET TRUE;
GRANT public_reader TO app WITH INHERIT FALSE, SET TRUE;

-- `owner` creates the schemas and tables; nothing else may create anything.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO "owner"', current_database());
END
$$;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO "owner";
-- auth_app reaches only the auth schema.
GRANT USAGE ON SCHEMA public TO app, "system", retention, public_reader;
