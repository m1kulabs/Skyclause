ALTER TABLE "call" ADD COLUMN "notices" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "call" ADD COLUMN "recipients" text[] DEFAULT '{}' NOT NULL;