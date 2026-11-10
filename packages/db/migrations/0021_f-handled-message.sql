CREATE TABLE "handled_message" (
	"consumer" text NOT NULL,
	"message_id" text NOT NULL,
	"handled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handled_message_consumer_message_id_pk" PRIMARY KEY("consumer","message_id")
);
