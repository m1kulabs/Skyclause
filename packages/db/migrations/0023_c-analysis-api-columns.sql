ALTER TABLE "analysis_metric" ALTER COLUMN "x" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_metric" ALTER COLUMN "low" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_metric" ALTER COLUMN "high" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "pack" "pack";--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "clause" text;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "period" text NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "value" double precision;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "samples" double precision[];--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "range_from" date NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD COLUMN "range_to" date NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD CONSTRAINT "analysis_metric_figure_key" UNIQUE NULLS NOT DISTINCT("project_id","period","pack","clause","metric","range_from");