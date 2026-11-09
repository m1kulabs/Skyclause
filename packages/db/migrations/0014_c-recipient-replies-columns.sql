-- c-recipient-replies (#163): a reply records its call and when it was made; plan feedback is counted per window, and
-- its answer becomes yes or no so no text column can hold free text (ANL-7). Both tables are empty until this ticket
-- writes them, so the NOT NULL columns need no default and the type change rewrites no row.
ALTER TABLE "plan_feedback" ALTER COLUMN "answer" SET DATA TYPE boolean USING "answer"::boolean;--> statement-breakpoint
ALTER TABLE "crowd_reply" ADD COLUMN "call_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "crowd_reply" ADD COLUMN "at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD COLUMN "window_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "crowd_reply" ADD CONSTRAINT "crowd_reply_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_window_fk" FOREIGN KEY ("org_id","window_id") REFERENCES "public"."window"("org_id","id") ON DELETE cascade ON UPDATE no action;