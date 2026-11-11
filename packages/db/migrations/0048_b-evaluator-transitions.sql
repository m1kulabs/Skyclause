CREATE TABLE "evaluator_reevaluation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"reason" text NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "evaluator_reevaluation_project_pack_key" UNIQUE("project_id","pack")
);
--> statement-breakpoint
CREATE TABLE "evaluator_source_delivery" (
	"transition_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"recipient_org_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "evaluator_source_delivery_transition_id_project_id_pk" PRIMARY KEY("transition_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "evaluator_source_transition" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"state" "input_state" NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"http_status" integer,
	"pending_until" timestamp with time zone,
	"event_type" text,
	"targets" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shadow_state" ADD COLUMN "evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_state" ADD COLUMN "evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evaluator_reevaluation" ADD CONSTRAINT "evaluator_reevaluation_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_source_delivery" ADD CONSTRAINT "evaluator_source_delivery_transition_id_evaluator_source_transition_id_fk" FOREIGN KEY ("transition_id") REFERENCES "public"."evaluator_source_transition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_source_transition" ADD CONSTRAINT "evaluator_source_transition_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluator_reevaluation_org_id_idx" ON "evaluator_reevaluation" USING btree ("org_id");
--> statement-breakpoint
SELECT tenant_table('evaluator_reevaluation');
--> statement-breakpoint
GRANT SELECT, INSERT ON evaluator_source_transition TO system;
GRANT SELECT, INSERT, UPDATE, DELETE ON evaluator_source_delivery TO system;
GRANT SELECT, INSERT, UPDATE, DELETE ON evaluator_source_transition, evaluator_source_delivery TO retention;
SELECT attach_append_only('evaluator_source_transition');
