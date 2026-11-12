CREATE INDEX "notice_call_id_idx" ON "notice" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "approval_org_id_bundle_id_idx" ON "approval" USING btree ("org_id","bundle_id");--> statement-breakpoint
CREATE INDEX "bundle_org_id_needs_review_at_idx" ON "bundle" USING btree ("org_id","needs_review_at");--> statement-breakpoint
CREATE INDEX "bundle_org_id_sla_due_at_idx" ON "bundle" USING btree ("org_id","sla_due_at");--> statement-breakpoint
CREATE INDEX "call_org_id_approved_at_idx" ON "call" USING btree ("org_id","approved_at");