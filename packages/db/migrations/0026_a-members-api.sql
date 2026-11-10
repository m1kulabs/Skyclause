-- #103 a-members-api: member and invitation writes are scoped to withTenant; token inspection is read-only in system.
RESET ROLE;
SET LOCAL ROLE "owner";

ALTER TABLE auth.member ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_app ON auth.member TO auth_app USING (true) WITH CHECK (true);
CREATE POLICY app_tenant ON auth.member TO app
  USING (organization_id = current_org_id()) WITH CHECK (organization_id = current_org_id());
CREATE POLICY system_read ON auth.member FOR SELECT TO "system"
  USING (current_org_id() IS NULL OR organization_id = current_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.member TO app;
GRANT SELECT ON auth.member TO "system";

ALTER TABLE auth.invitation ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_app ON auth.invitation TO auth_app USING (true) WITH CHECK (true);
CREATE POLICY app_tenant ON auth.invitation TO app
  USING (organization_id = current_org_id()) WITH CHECK (organization_id = current_org_id());
CREATE POLICY system_read ON auth.invitation FOR SELECT TO "system"
  USING (current_org_id() IS NULL OR organization_id = current_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.invitation TO app;
GRANT SELECT ON auth.invitation TO "system";

RESET ROLE;
