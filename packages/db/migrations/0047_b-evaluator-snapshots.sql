ALTER TABLE "indicator_snapshot" ADD COLUMN "snapshot_body" jsonb;--> statement-breakpoint
ALTER TABLE "indicator_snapshot" ADD COLUMN "registry_definitions" jsonb;--> statement-breakpoint
ALTER TABLE "indicator_snapshot" ADD COLUMN "frozen_windows" jsonb;--> statement-breakpoint
ALTER TABLE "indicator_snapshot" ADD COLUMN "archive_hash" text;--> statement-breakpoint
-- DDL sees all keys even though forced tenant RLS hides rows from the migration owner.
-- Never delete duplicate immutable evidence or broaden RLS to diagnose it.
DO $$
DECLARE duplicate_detail text;
BEGIN
  ALTER TABLE "indicator_snapshot" ADD CONSTRAINT "indicator_snapshot_project_pack_t_eval_key" UNIQUE("project_id","pack","t_eval");
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS duplicate_detail = PG_EXCEPTION_DETAIL;
  RAISE EXCEPTION 'evaluator snapshot duplicate key: %; immutable rows require diagnosis', duplicate_detail;
END $$;
