ALTER TABLE "poll" ADD COLUMN "purpose" text DEFAULT 'poll' NOT NULL;
--> statement-breakpoint
ALTER TABLE "poll" ADD COLUMN "body_sha256" text;
--> statement-breakpoint
ALTER TABLE "poll" ADD COLUMN "api_family" text;
--> statement-breakpoint
ALTER TABLE "reading" ALTER COLUMN "item_key" SET DEFAULT '';
