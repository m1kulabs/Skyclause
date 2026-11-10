ALTER TABLE "run" ADD COLUMN "night_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "coalesced_keys" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "requested_by" jsonb;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "provider" text;--> statement-breakpoint
CREATE UNIQUE INDEX "run_one_running_key" ON "run" USING btree ("project_id","pack") WHERE "run"."status" = 'running';