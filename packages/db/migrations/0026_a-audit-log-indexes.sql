DROP INDEX "audit_event_org_id_at_idx";--> statement-breakpoint
ALTER TABLE "audit_event" ALTER COLUMN "at" SET DEFAULT date_trunc('milliseconds', now());--> statement-breakpoint
CREATE INDEX "audit_event_org_action_at_idx" ON "audit_event" USING btree ("org_id","action","at" desc);--> statement-breakpoint
CREATE INDEX "audit_event_org_actor_at_idx" ON "audit_event" USING btree ("org_id","actor_id","at" desc);--> statement-breakpoint
CREATE INDEX "audit_event_org_target_at_idx" ON "audit_event" USING btree ("org_id","target_type","target_id","at" desc);--> statement-breakpoint
CREATE INDEX "audit_event_org_project_at_idx" ON "audit_event" USING btree ("org_id","project_id","at" desc);--> statement-breakpoint
CREATE INDEX "audit_event_org_id_at_idx" ON "audit_event" USING btree ("org_id","at" desc);