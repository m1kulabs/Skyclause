CREATE TABLE "ai_key_test" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ai_key_id" uuid,
	"fingerprint" text NOT NULL,
	"ok" boolean NOT NULL,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "ai_key_test_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "ai_key" ADD COLUMN "last_test_ok" boolean;--> statement-breakpoint
ALTER TABLE "ai_key" ADD COLUMN "last_test_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_key" ADD COLUMN "last_test_detail" text;--> statement-breakpoint
ALTER TABLE "ai_key" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_key_test" ADD CONSTRAINT "ai_key_test_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_key_test" ADD CONSTRAINT "ai_key_test_ai_key_fk" FOREIGN KEY ("org_id","ai_key_id") REFERENCES "public"."ai_key"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_key_test_org_id_idx" ON "ai_key_test" USING btree ("org_id");