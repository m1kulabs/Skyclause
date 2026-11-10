ALTER TABLE "poll" ADD COLUMN "purpose" text DEFAULT 'poll' NOT NULL;
--> statement-breakpoint
ALTER TABLE "poll" ADD COLUMN "body_sha256" text;
--> statement-breakpoint
ALTER TABLE "poll" ADD COLUMN "api_family" text;
--> statement-breakpoint
ALTER TABLE "reading" ALTER COLUMN "item_key" SET DEFAULT '';
--> statement-breakpoint
CREATE INDEX "poll_request_id_idx" ON "poll" ("request_id");
--> statement-breakpoint
CREATE INDEX "reading_poll_id_idx" ON "reading" ("poll_id");
--> statement-breakpoint
CREATE INDEX "poll_source_purpose_started_at_idx" ON "poll" ("source_id", "purpose", "started_at" DESC, "id" DESC);
