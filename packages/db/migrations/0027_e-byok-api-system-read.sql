-- Custom SQL migration file, put your code below!
-- ai_key_test (org, through #92's tenant_table): app inserts and reads it per tenant; rows are append-only. Runs as `owner`.
SELECT tenant_table('ai_key_test');
SELECT attach_append_only('ai_key_test');
-- e-byok-api: the `kms:rewrap` job sweeps every organisation's sealed keys starting from no organisation, so
-- `withSystem` may read `ai_key` to find each row's organisation, as `c-sender-email-lookup` lets it read `notice`.
-- Writes stay per tenant.
CREATE POLICY system_read ON ai_key FOR SELECT TO "system" USING (current_org_id() IS NULL);
