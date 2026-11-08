-- #79 §3 RLS letters, TRD "Tenancy, append-only tables and partitions" and "Tenancy enforcement". Runs as `owner`.
--
-- The tenant policy reads `nullif(current_setting('app.org_id', true), '')`: a pooled connection that once ran
-- set_config('app.org_id', …, true) reads '' afterwards, and ''::uuid would raise instead of matching no row.

-- TRD append-only tables: UPDATE, DELETE and TRUNCATE are refused unless the current role is `retention`.
CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'retention' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on %.% is refused: the table is append-only', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege', HINT = 'Only the retention role updates or deletes these rows.';
END
$$;

-- `SELECT attach_append_only('<table>')` after `tenant_table` (or a table's own grants). Row triggers are cloned to
-- partitions; TRUNCATE gets a statement trigger. `app` and `system` keep INSERT and SELECT only.
CREATE FUNCTION attach_append_only(t regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION append_only()', t);
  EXECUTE format('CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION append_only()', t);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM app, "system"', t);
END
$$;

-- The SQL half of a T table (src/schema/tenant.ts holds the columns): RLS enabled and forced, so `owner` is held to it
-- too; the tenant policy; a `retention` policy, since retention sweeps and erasure work across organisations and no
-- login has BYPASSRLS; and the grants.
CREATE FUNCTION tenant_table(t regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
  EXECUTE format(
    $policy$CREATE POLICY tenant ON %s
      USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
      WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$policy$,
    t
  );
  EXECUTE format('CREATE POLICY retention ON %s TO retention USING (true)', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO app, "system"', t);
  EXECUTE format('GRANT SELECT, UPDATE, DELETE ON %s TO retention', t);
END
$$;

REVOKE EXECUTE ON FUNCTION attach_append_only(regclass), tenant_table(regclass) FROM PUBLIC;
--> statement-breakpoint

-- project and project_pack: T, and P through the public_* views.
SELECT tenant_table('project');
SELECT tenant_table('project_pack');

-- withSystem sees every organisation's projects read-only, and only while no organisation is set, so withTenant as a
-- system principal stays scoped.
CREATE POLICY system_read ON project FOR SELECT TO "system"
  USING (nullif(current_setting('app.org_id', true), '') IS NULL);
CREATE POLICY system_read ON project_pack FOR SELECT TO "system"
  USING (nullif(current_setting('app.org_id', true), '') IS NULL);

-- A view reads its tables as its owner, and FORCE holds `owner` to RLS, so these let the views see public rows.
-- public_reader gets the views only, never the base tables.
CREATE POLICY public_read ON project FOR SELECT TO "owner" USING (public);
CREATE POLICY public_read ON project_pack FOR SELECT TO "owner"
  USING (project_id IN (SELECT id FROM project WHERE public));

CREATE VIEW public_project WITH (security_barrier) AS
  SELECT p.id, p.org_id, o.slug AS org_slug, p.slug, p.name, p.time_zone, p.site_name, p.site_lat, p.site_lon,
    p.archived_at
  FROM project p
  JOIN auth.organization o ON o.id = p.org_id
  WHERE p.public;

CREATE VIEW public_project_pack WITH (security_barrier) AS
  SELECT pp.project_id, pp.pack, pp.enabled
  FROM project_pack pp
  JOIN project p ON p.id = pp.project_id
  WHERE p.public;

GRANT SELECT ON public_project, public_project_pack TO public_reader;
--> statement-breakpoint

-- feature_flag: G, read-only to app and public_reader; an organisation sees the global rows and its own.
ALTER TABLE feature_flag ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY read ON feature_flag FOR SELECT
  USING (org_id IS NULL OR org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE POLICY "system" ON feature_flag TO "system" USING (true);
GRANT SELECT ON feature_flag TO app, public_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flag TO "system";
--> statement-breakpoint

-- auth (A): Better Auth's login has the whole schema, including tables added later; app and system read only
-- organisations, members and users.
GRANT USAGE ON SCHEMA auth TO auth_app, app, "system";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO auth_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_app;
GRANT SELECT ON auth.organization, auth.member, auth."user" TO app, "system";
