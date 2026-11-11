-- Legacy availability remains unknown; no default or UPDATE of immutable polls.
ALTER TABLE "poll" ADD COLUMN "received_at" timestamp with time zone;
