CREATE TYPE "public"."shift_reminder_kind" AS ENUM('before_shift', 'switched_on');--> statement-breakpoint
ALTER TABLE "push_subscription" DROP CONSTRAINT "push_subscription_endpoint_unique";--> statement-breakpoint
ALTER TABLE "shift_reminder" ADD COLUMN "local_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_reminder" ADD COLUMN "kind" "shift_reminder_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_org_id_endpoint_key" UNIQUE("org_id","endpoint");--> statement-breakpoint
ALTER TABLE "bundle_alert" ADD CONSTRAINT "bundle_alert_bundle_id_account_id_channel_level_key" UNIQUE("bundle_id","account_id","channel","level");--> statement-breakpoint
ALTER TABLE "shift_reminder" ADD CONSTRAINT "shift_reminder_rota_shift_id_local_date_kind_key" UNIQUE("rota_shift_id","local_date","kind");