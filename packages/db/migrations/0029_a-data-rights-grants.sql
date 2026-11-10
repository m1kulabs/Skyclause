-- Data-rights transactions run as `retention` to erase auth rows and preserve pseudonymous audit records.
GRANT USAGE ON SCHEMA auth TO retention;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO retention;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO retention;
GRANT INSERT ON audit_event TO retention;
--> statement-breakpoint
-- `system` creates and delivers the `export_ready` outbox row, including the account-scope row with no org_id.
CREATE POLICY system_export_ready ON notice FOR ALL TO "system"
  USING (kind = 'export_ready') WITH CHECK (kind = 'export_ready');
