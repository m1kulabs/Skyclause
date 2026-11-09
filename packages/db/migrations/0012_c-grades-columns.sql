ALTER TABLE "grade" DROP CONSTRAINT "grade_call_or_night";--> statement-breakpoint
ALTER TABLE "grade" ADD COLUMN "local_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "grade" ADD COLUMN "actual" double precision;--> statement-breakpoint
ALTER TABLE "grade" ADD COLUMN "forecast_id" uuid;--> statement-breakpoint
ALTER TABLE "grade" ADD COLUMN "band_low" double precision;--> statement-breakpoint
ALTER TABLE "grade" ADD COLUMN "band_high" double precision;--> statement-breakpoint
ALTER TABLE "grade" ADD COLUMN "reading_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_item" ADD COLUMN "reasons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_item" ADD COLUMN "explained_by" uuid;--> statement-breakpoint
ALTER TABLE "review_item" ADD COLUMN "explained_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "grade_call_id_key" ON "grade" USING btree ("call_id") WHERE "grade"."call_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "grade_night_id_key" ON "grade" USING btree ("night_id") WHERE "grade"."night_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "grade_window_id_key" ON "grade" USING btree ("window_id") WHERE "grade"."call_id" IS NULL AND "grade"."night_id" IS NULL;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_call_or_night" CHECK (num_nonnulls("grade"."call_id", "grade"."night_id") = 1 OR ("grade"."call_id" IS NULL AND "grade"."night_id" IS NULL AND "grade"."window_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_reasons" CHECK ("review_item"."reasons" <@ ARRAY['miss', 'false_alarm', 'expired_above_normal', 'out_of_band', 'unlisted_surge', 'no_call']::text[]);