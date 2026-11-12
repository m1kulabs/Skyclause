ALTER TABLE "ics_feed" ADD COLUMN "kind" "window_kind" DEFAULT 'class' NOT NULL;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "next_refresh_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "refresh_claim" uuid;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "skipped" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD COLUMN "materialised_until" date;--> statement-breakpoint
ALTER TABLE "window" ADD COLUMN "cancellation_origin" text;--> statement-breakpoint
ALTER TABLE "window" ADD COLUMN "series_occurrence_date" date;--> statement-breakpoint
ALTER TABLE "window" ADD COLUMN "ics_uid" text;--> statement-breakpoint
ALTER TABLE "window" ADD COLUMN "ics_recurrence_id" text;--> statement-breakpoint
ALTER TABLE "window" ADD COLUMN "local_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "window_series" ADD COLUMN "definition" jsonb;--> statement-breakpoint
ALTER TABLE "window_series" ADD COLUMN "ics_feed_id" uuid;--> statement-breakpoint
ALTER TABLE "window_series" ADD COLUMN "ics_uid" text;--> statement-breakpoint
ALTER TABLE "window_series" ADD COLUMN "checked_on" date;--> statement-breakpoint
ALTER TABLE "window_series" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "window_series" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "window_series" ADD CONSTRAINT "window_series_ics_feed_fk" FOREIGN KEY ("org_id","ics_feed_id") REFERENCES "public"."ics_feed"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_native_identity_key" UNIQUE("series_id","series_occurrence_date");--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_import_identity_key" UNIQUE("ics_feed_id","ics_uid","ics_recurrence_id");--> statement-breakpoint
ALTER TABLE "window_series" ADD CONSTRAINT "window_series_import_identity_key" UNIQUE("ics_feed_id","ics_uid");--> statement-breakpoint
ALTER TABLE "ics_feed" ADD CONSTRAINT "ics_feed_document_check" CHECK ("ics_feed"."document" IS NULL OR (jsonb_typeof("ics_feed"."document") = 'object' AND coalesce("ics_feed"."document"->'version' = '1'::jsonb, false) AND coalesce(jsonb_typeof("ics_feed"."document"->'jcal') = 'array', false)));--> statement-breakpoint
ALTER TABLE "ics_feed" ADD CONSTRAINT "ics_feed_provenance_check" CHECK ("ics_feed"."provenance" IS NULL OR (jsonb_typeof("ics_feed"."provenance") = 'object' AND coalesce("ics_feed"."provenance"->'version' = '1'::jsonb, false)));--> statement-breakpoint
ALTER TABLE "ics_feed" ADD CONSTRAINT "ics_feed_skipped_check" CHECK (jsonb_typeof("ics_feed"."skipped") = 'array');--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_native_identity_check" CHECK ("window"."series_occurrence_date" IS NULL OR ("window"."series_id" IS NOT NULL AND "window"."ics_feed_id" IS NULL));--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_import_identity_check" CHECK (("window"."ics_uid" IS NULL AND "window"."ics_recurrence_id" IS NULL) OR ("window"."ics_feed_id" IS NOT NULL AND "window"."ics_uid" IS NOT NULL AND "window"."ics_recurrence_id" IS NOT NULL AND octet_length("window"."ics_uid") BETWEEN 1 AND 1024 AND octet_length("window"."ics_recurrence_id") <= 1024));--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_cancellation_origin_check" CHECK ("window"."cancellation_origin" IS NULL OR ("window"."cancelled_at" IS NOT NULL AND "window"."cancellation_origin" IN ('manual', 'series', 'source')));--> statement-breakpoint
ALTER TABLE "window_series" ADD CONSTRAINT "window_series_import_identity_check" CHECK (("window_series"."ics_feed_id" IS NULL AND "window_series"."ics_uid" IS NULL) OR ("window_series"."ics_feed_id" IS NOT NULL AND "window_series"."ics_uid" IS NOT NULL AND octet_length("window_series"."ics_uid") BETWEEN 1 AND 1024));--> statement-breakpoint
ALTER TABLE "window_series" ADD CONSTRAINT "window_series_definition_check" CHECK ("window_series"."definition" IS NULL OR (jsonb_typeof("window_series"."definition") = 'object' AND coalesce("window_series"."definition"->'version' = '1'::jsonb, false)));