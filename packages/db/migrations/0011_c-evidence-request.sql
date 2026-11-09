CREATE TYPE "public"."evidence_requester_kind" AS ENUM('member', 'guest', 'share_link', 'subscriber');--> statement-breakpoint
ALTER TABLE "evidence_request" ADD COLUMN "requester_kind" "evidence_requester_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD COLUMN "subscriber_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD COLUMN "pack" jsonb;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD COLUMN "pack_hash" text;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_subscriber_fk" FOREIGN KEY ("org_id","subscriber_id") REFERENCES "public"."subscriber"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_message_id_unique" UNIQUE("message_id");--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_subscriber_kind" CHECK (("evidence_request"."requester_kind" = 'subscriber') = ("evidence_request"."subscriber_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_times" CHECK ("evidence_request"."drafted_at" >= "evidence_request"."received_at" AND "evidence_request"."approved_at" >= "evidence_request"."drafted_at" AND "evidence_request"."replied_at" >= "evidence_request"."received_at" AND "evidence_request"."replied_at" >= "evidence_request"."drafted_at" AND "evidence_request"."replied_at" >= "evidence_request"."approved_at" AND ("evidence_request"."approved_at" IS NULL OR "evidence_request"."drafted_at" IS NOT NULL) AND ("evidence_request"."replied_at" IS NULL OR "evidence_request"."drafted_at" IS NOT NULL));