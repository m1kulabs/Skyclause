CREATE TABLE "source_observation_head" (
	"source_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"item_key" text DEFAULT '' NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_observation_head_source_id_metric_observed_at_item_key_pk" PRIMARY KEY("source_id","metric","observed_at","item_key")
);
--> statement-breakpoint
ALTER TABLE "source_observation_head" ADD CONSTRAINT "source_observation_head_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
SELECT system_table('source_observation_head'::regclass);
