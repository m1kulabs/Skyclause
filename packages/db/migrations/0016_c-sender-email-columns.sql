ALTER TABLE "notice" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notice" ADD COLUMN "claimed_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notice_provider_message_id_idx" ON "notice" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "notice_queued_idx" ON "notice" USING btree ("org_id") WHERE "notice"."status" = 'queued';