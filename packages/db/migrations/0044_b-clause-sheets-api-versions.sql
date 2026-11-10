ALTER TABLE "sheet_version" ALTER COLUMN "n" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sheet_version" ADD COLUMN "base_n" integer;--> statement-breakpoint
ALTER TABLE "sheet_version" ADD COLUMN "check_result" jsonb;--> statement-breakpoint
ALTER TABLE "sheet_version" ADD COLUMN "checked_content" jsonb;--> statement-breakpoint
ALTER TABLE "sheet_version" ADD COLUMN "validation_registry_hash" text;--> statement-breakpoint
ALTER TABLE "sheet_version" ADD COLUMN "publish_preview" jsonb;--> statement-breakpoint
UPDATE "sheet_version" SET "n" = NULL WHERE "status" = 'draft';--> statement-breakpoint
ALTER TABLE "sheet_version" ADD CONSTRAINT "sheet_version_status_n_check" CHECK (("sheet_version"."status" = 'draft' AND "sheet_version"."n" IS NULL) OR ("sheet_version"."status" = 'published' AND "sheet_version"."n" IS NOT NULL AND "sheet_version"."n" > 0));