CREATE TYPE "public"."consent_form" AS ENUM('subscribe_link', 'import', 'confirm', 'preferences');--> statement-breakpoint
ALTER TABLE "subscriber_token" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_record" ADD COLUMN "form" "consent_form" NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_record" ADD COLUMN "language" text NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_record" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "consent_record" ADD COLUMN "changed" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriber" ADD COLUMN "email_hash" text;--> statement-breakpoint
ALTER TABLE "subscriber" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriber_token" ADD COLUMN "used_at" timestamp with time zone;