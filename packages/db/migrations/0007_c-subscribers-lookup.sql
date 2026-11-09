-- c-subscribers (#157): a link token arrives without its organisation, so `withSystem` (no `app.org_id`) may read
-- `subscriber_token` and `subscribe_link` to find it by hash, as 0002 lets it read `project`. Writes stay per tenant.
CREATE POLICY system_read ON subscriber_token FOR SELECT TO "system" USING (current_org_id() IS NULL);--> statement-breakpoint
CREATE POLICY system_read ON subscribe_link FOR SELECT TO "system" USING (current_org_id() IS NULL);
