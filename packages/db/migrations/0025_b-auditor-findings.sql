CREATE TABLE "audit_finding" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"check" text NOT NULL,
	"key" text NOT NULL,
	"org_id" uuid,
	"project_id" uuid,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"account_ids" uuid[] NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"recovered_at" timestamp with time zone,
	CONSTRAINT "audit_finding_platform_project_null" CHECK ("audit_finding"."org_id" IS NOT NULL OR "audit_finding"."project_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "audit_finding" ADD CONSTRAINT "audit_finding_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_finding" ADD CONSTRAINT "audit_finding_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_finding_open_identity" ON "audit_finding" USING btree ("check","org_id","project_id","key") NULLS NOT DISTINCT WHERE "audit_finding"."recovered_at" IS NULL;
--> statement-breakpoint
SELECT system_table('audit_finding');
