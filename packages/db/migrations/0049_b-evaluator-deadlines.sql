CREATE TABLE "evaluator_deadline" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"generation" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"cleaned_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	CONSTRAINT "evaluator_deadline_generation_key" UNIQUE("project_id","generation")
);
--> statement-breakpoint
ALTER TABLE "evaluator_deadline" ADD CONSTRAINT "evaluator_deadline_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluator_deadline_org_id_idx" ON "evaluator_deadline" USING btree ("org_id");
--> statement-breakpoint
SELECT tenant_table('evaluator_deadline');
