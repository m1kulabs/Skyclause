CREATE TYPE "public"."alert_channel" AS ENUM('web_push', 'email');--> statement-breakpoint
CREATE TYPE "public"."alert_level" AS ENUM('on_duty', 'next_approver', 'admins');--> statement-breakpoint
CREATE TYPE "public"."approval_action" AS ENUM('approve', 'edit', 'reject', 'reconfirm', 'choose_verdict', 'escalate', 'list', 'reject_listing', 'approve_change', 'approve_cancel', 'approve_reply');--> statement-breakpoint
CREATE TYPE "public"."audit_actor" AS ENUM('account', 'api_key', 'oauth_client', 'guest_token', 'share_link', 'device', 'system');--> statement-breakpoint
CREATE TYPE "public"."bundle_state" AS ENUM('drafted', 'closed', 'needs_review', 'superseded', 'expired', 'reconfirm', 'approved', 'sending', 'sent', 'graded');--> statement-breakpoint
CREATE TYPE "public"."call_state" AS ENUM('drafted', 'approved', 'edited', 'rejected', 'expired', 'superseded', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crowd_reply_kind" AS ENUM('keep', 'shift', 'shuttle');--> statement-breakpoint
CREATE TYPE "public"."evidence_via" AS ENUM('email', 'app', 'api', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."export_scope" AS ENUM('account', 'organisation');--> statement-breakpoint
CREATE TYPE "public"."freshness" AS ENUM('observed', 'polled');--> statement-breakpoint
CREATE TYPE "public"."grade_outcome" AS ENUM('hit', 'miss', 'false_alarm', 'correct_normal', 'no_call', 'in_band', 'out_of_band', 'unlisted_surge', 'pending');--> statement-breakpoint
CREATE TYPE "public"."guest_subject_kind" AS ENUM('device', 'ip', 'share_link', 'commons');--> statement-breakpoint
CREATE TYPE "public"."incident_scope" AS ENUM('ours', 'source');--> statement-breakpoint
CREATE TYPE "public"."input_state" AS ENUM('fresh', 'stale', 'error', 'recovered', 'pending', 'probation', 'off_hours');--> statement-breakpoint
CREATE TYPE "public"."key_owner" AS ENUM('organisation', 'account');--> statement-breakpoint
CREATE TYPE "public"."listing_state" AS ENUM('proposed', 'listed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mode" AS ENUM('normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'surge_night');--> statement-breakpoint
CREATE TYPE "public"."moderation" AS ENUM('visible', 'hidden_pending_review', 'removed');--> statement-breakpoint
CREATE TYPE "public"."night_state" AS ENUM('upcoming', 'in_progress', 'awaiting_actuals', 'graded', 'unlisted');--> statement-breakpoint
CREATE TYPE "public"."notice_channel" AS ENUM('email', 'push');--> statement-breakpoint
CREATE TYPE "public"."notice_kind" AS ENUM('call', 'approver_alert', 'confirmation', 'preference_link', 'feedback', 'evidence_reply', 'webhook_disabled', 'export_ready');--> statement-breakpoint
CREATE TYPE "public"."notice_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('needs_review', 'escalated', 'source_error', 'review_item', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."pilot_archive_kind" AS ENUM('sheets_ledger', 'jira_register', 'run_traces');--> statement-breakpoint
CREATE TYPE "public"."principal_client" AS ENUM('app', 'api', 'cli', 'mcp', 'playground', 'worker');--> statement-breakpoint
CREATE TYPE "public"."project_channel_kind" AS ENUM('email', 'ics', 'webhook', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."reply_channel" AS ENUM('email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."rota_template" AS ENUM('storm_afternoon', 'surge_night', 'custom');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'drafted', 'no_draft', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('schedule', 'crossing', 'window', 'listing', 'calendar', 'request');--> statement-breakpoint
CREATE TYPE "public"."scope_kind" AS ENUM('site', 'window', 'night');--> statement-breakpoint
CREATE TYPE "public"."share_access" AS ENUM('view', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."sheet_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('jps_rain', 'met_warning', 'met_forecast', 'apims', 'rapidrail_od', 'gtfs_static', 'gtfs_rt', 'golive', 'wikipedia', 'camera', 'pi');--> statement-breakpoint
CREATE TYPE "public"."source_role" AS ENUM('rain_gauge', 'api_station', 'warnings', 'met_forecast', 'rail_station', 'venue_listings', 'bus_feed', 'gtfs_static', 'camera', 'pi');--> statement-breakpoint
CREATE TYPE "public"."subscriber_token_purpose" AS ENUM('confirm', 'manage', 'unsubscribe', 'reply', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('bounce', 'complaint', 'unsubscribe');--> statement-breakpoint
CREATE TYPE "public"."verification_target" AS ENUM('claude_ai', 'claude_desktop', 'claude_code', 'chatgpt', 'gemini_cli', 'gemini_enterprise', 'cursor', 'vscode');--> statement-breakpoint
CREATE TYPE "public"."window_kind" AS ENUM('class', 'event', 'commute_wave');--> statement-breakpoint
CREATE TYPE "public"."window_via" AS ENUM('app', 'form', 'ics', 'api', 'cli', 'mcp', 'guest', 'share');--> statement-breakpoint
CREATE TABLE "ai_key" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_type" "key_owner" NOT NULL,
	"account_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"last4" text NOT NULL,
	"fingerprint" text NOT NULL,
	"ciphertext" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"kek_version" text NOT NULL,
	"declared_tier" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "ai_key_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "ai_key_org_id_fingerprint_key" UNIQUE("org_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid,
	"ai_key_id" uuid,
	"model" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_token" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"device_hash" text,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "guest_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_grant" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"project_ids" uuid[],
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"share_link_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_org_client" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "oauth_org_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid,
	"project_id" uuid,
	"name" text NOT NULL,
	"props" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid,
	"actor_type" "audit_actor" NOT NULL,
	"actor_id" text NOT NULL,
	"client" "principal_client" NOT NULL,
	"client_name" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	CONSTRAINT "domain_event_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "domain_event_project_id_seq_key" UNIQUE("project_id","seq")
);
--> statement-breakpoint
CREATE TABLE "event_counter" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"last_seq" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handled_event" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"handled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handled_event_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
CREATE TABLE "clause" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"sheet_version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"requires" text[] DEFAULT '{}' NOT NULL,
	"span" jsonb,
	"when" text NOT NULL,
	"proposes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "clause_sheet_version_id_key_key" UNIQUE("sheet_version_id","key")
);
--> statement-breakpoint
CREATE TABLE "clause_sheet" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"live_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "clause_sheet_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "clause_sheet_project_id_pack_key" UNIQUE("project_id","pack")
);
--> statement-breakpoint
CREATE TABLE "crossing" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"scope_kind" "scope_kind" NOT NULL,
	"scope_id" uuid,
	"from" text,
	"to" text,
	"at" timestamp with time zone NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"verdict_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "crossing_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "indicator_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"t_eval" timestamp with time zone NOT NULL,
	"inputs" jsonb NOT NULL,
	"site" jsonb NOT NULL,
	"series" jsonb NOT NULL,
	"nights" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "indicator_snapshot_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "probation_label" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"frame_reading_id" uuid NOT NULL,
	"labeller_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probation_resolution" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_result" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"sheet_version_id" uuid,
	"label" text DEFAULT 'replay' NOT NULL,
	"range_from" timestamp with time zone NOT NULL,
	"range_to" timestamp with time zone NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_state" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"scope_kind" "scope_kind" NOT NULL,
	"scope_id" uuid,
	"verdict" jsonb NOT NULL,
	"verdict_hash" text NOT NULL,
	"sheet_version_id" uuid NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "shadow_state_scope_key" UNIQUE NULLS NOT DISTINCT("project_id","pack","scope_kind","scope_id")
);
--> statement-breakpoint
CREATE TABLE "sheet_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"status" "sheet_status" DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "sheet_version_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "sheet_version_sheet_id_n_key" UNIQUE("sheet_id","n")
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"notice_version" text NOT NULL,
	"ip_hash" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowd_reply" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"window_id" uuid NOT NULL,
	"subscriber_id" uuid,
	"kind" "crowd_reply_kind" NOT NULL,
	"shift_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "notice_kind" NOT NULL,
	"channel" "notice_channel" NOT NULL,
	"idempotency_key" text NOT NULL,
	"call_id" uuid,
	"account_id" uuid,
	"subscriber_id" uuid,
	"language" text NOT NULL,
	"status" "notice_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"accepted_at" timestamp with time zone,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "notice_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"recovered" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "notification_preference_org_id_account_id_kind_key" UNIQUE("org_id","account_id","kind")
);
--> statement-breakpoint
CREATE TABLE "plan_feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"call_id" uuid,
	"answer" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "plan_feedback_count_one" CHECK ("plan_feedback"."count" = 1)
);
--> statement-breakpoint
CREATE TABLE "project_channel" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"channel" "project_channel_kind" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "project_channel_project_id_channel_key" UNIQUE("project_id","channel")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_ok_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "subscribe_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "subscribe_link_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"language" text DEFAULT 'en' NOT NULL,
	"window_ids" uuid[] DEFAULT '{}' NOT NULL,
	"channels" text[] DEFAULT '{email}' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "subscriber_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "subscriber_project_id_email_key" UNIQUE("project_id","email")
);
--> statement-breakpoint
CREATE TABLE "subscriber_token" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "subscriber_token_purpose" NOT NULL,
	"call_id" uuid,
	"window_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "subscriber_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email_hash" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "suppression_org_id_email_hash_key" UNIQUE("org_id","email_hash")
);
--> statement-breakpoint
CREATE TABLE "analysis_metric" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"x" integer NOT NULL,
	"n" integer NOT NULL,
	"low" double precision NOT NULL,
	"high" double precision NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"span_from" timestamp with time zone NOT NULL,
	"span_to" timestamp with time zone NOT NULL,
	"requester" text NOT NULL,
	"call_id" uuid,
	"via" "evidence_via" NOT NULL,
	"leaves_org" boolean DEFAULT false NOT NULL,
	"reply_channel" "reply_channel",
	"status" text DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drafted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "evidence_request_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "grade" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"call_id" uuid,
	"night_id" uuid,
	"window_id" uuid,
	"sheet_version_id" uuid NOT NULL,
	"outcome" "grade_outcome" NOT NULL,
	"proposed_mode" "mode",
	"observed_mode" "mode",
	"mode_diff" integer NOT NULL,
	"no_call" boolean NOT NULL,
	"agrees" boolean NOT NULL,
	"stale_inputs" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "grade_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "grade_call_or_night" CHECK (num_nonnulls("grade"."call_id", "grade"."night_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"kind" text NOT NULL,
	"refs" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"corrects" uuid,
	"org_id" uuid NOT NULL,
	CONSTRAINT "ledger_entry_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "ledger_entry_project_id_seq_key" UNIQUE("project_id","seq")
);
--> statement-breakpoint
CREATE TABLE "review_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"grade_id" uuid NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "review_item_grade_id_unique" UNIQUE("grade_id")
);
--> statement-breakpoint
CREATE TABLE "bundle_alert" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"level" "alert_level" NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_transfer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "ownership_transfer_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rota_shift" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"project_id" uuid,
	"days" integer[] DEFAULT '{}' NOT NULL,
	"local_start" time NOT NULL,
	"local_end" time NOT NULL,
	"condition" text,
	"order" integer DEFAULT 0 NOT NULL,
	"template" "rota_template" DEFAULT 'custom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "rota_shift_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "shift_reminder" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"rota_shift_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"target" "verification_target" NOT NULL,
	"client_version" text NOT NULL,
	"tested_at" timestamp with time zone NOT NULL,
	"result" text NOT NULL,
	"tested_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_check" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"component" text NOT NULL,
	"ok" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_job" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope" "export_scope" NOT NULL,
	"org_id" uuid,
	"account_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"object_path" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_job_object_path_under_org" CHECK ("export_job"."object_path" IS NULL OR "export_job"."org_id" IS NULL OR "export_job"."object_path" LIKE 'orgs/' || "export_job"."org_id" || '/%')
);
--> statement-breakpoint
CREATE TABLE "guest_block" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_kind" "guest_subject_kind" NOT NULL,
	"subject_hash" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_block_subject_key" UNIQUE("subject_kind","subject_hash")
);
--> statement-breakpoint
CREATE TABLE "guest_budget" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"day" date NOT NULL,
	"subject_kind" "guest_subject_kind" NOT NULL,
	"subject_hash" text NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"evidence" integer DEFAULT 0 NOT NULL,
	"windows" integer DEFAULT 0 NOT NULL,
	"model_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "guest_budget_day_subject_key" UNIQUE("day","subject_kind","subject_hash")
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope" text NOT NULL,
	"route" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_scope_route_key_key" UNIQUE("scope","route","key")
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope" "incident_scope" NOT NULL,
	"component" text NOT NULL,
	"source_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_update" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"incident_id" uuid NOT NULL,
	"status" text NOT NULL,
	"body" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilot_archive" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "pilot_archive_kind" NOT NULL,
	"object_path" text NOT NULL,
	"sha256" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "pilot_archive_object_path_under_org" CHECK ("pilot_archive"."object_path" LIKE 'orgs/' || "pilot_archive"."org_id" || '/%')
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"bundle_id" uuid,
	"listing_id" uuid,
	"evidence_request_id" uuid,
	"call_id" uuid,
	"actor_id" uuid NOT NULL,
	"action" "approval_action" NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "approval_target" CHECK (num_nonnulls("approval"."bundle_id", "approval"."listing_id", "approval"."evidence_request_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "bundle" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"state" "bundle_state" DEFAULT 'drafted' NOT NULL,
	"superseded_by" uuid,
	"review_hash" text NOT NULL,
	"sla_due_at" timestamp with time zone,
	"needs_review_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"draft_only" boolean DEFAULT false NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "bundle_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "call" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"bundle_id" uuid NOT NULL,
	"window_id" uuid,
	"night_id" uuid,
	"mode" "mode",
	"watch" boolean DEFAULT false NOT NULL,
	"no_call" jsonb,
	"fired" jsonb DEFAULT '[]' NOT NULL,
	"recommendations" text[] DEFAULT '{}' NOT NULL,
	"reason" text,
	"shadow" jsonb NOT NULL,
	"chosen" text NOT NULL,
	"agrees" boolean NOT NULL,
	"decision" text,
	"state" "call_state" DEFAULT 'drafted' NOT NULL,
	"superseded_by_call_id" uuid,
	"ics_uid" text,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"drafted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "call_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "call_window_or_night" CHECK ("call"."window_id" IS NULL OR "call"."night_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"pack" "pack" NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"trigger_ref" text,
	"dedupe_key" text NOT NULL,
	"sheet_version_id" uuid,
	"snapshot_id" uuid,
	"window_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"reason" text,
	"verdict_hash" text,
	"model" text,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"triggered_at" timestamp with time zone NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "run_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "run_step" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"role" "source_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "project_source_project_id_source_id_role_key" UNIQUE("project_id","source_id","role")
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"external_id" text NOT NULL,
	"owner_org_id" uuid,
	"name" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"url" text NOT NULL,
	"cadence_s" integer NOT NULL,
	"freshness" "freshness" NOT NULL,
	"stale_after_s" integer NOT NULL,
	"licence_id" text NOT NULL,
	"licence_label" text NOT NULL,
	"probation" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_owner_org_id_kind_external_id_key" UNIQUE NULLS NOT DISTINCT("owner_org_id","kind","external_id")
);
--> statement-breakpoint
CREATE TABLE "source_state" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"state" "input_state" NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"http_status" integer,
	"pending_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"url" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"project_ids" uuid[],
	"secret_ciphertext" text NOT NULL,
	"secret_wrapped_dek" text NOT NULL,
	"secret_kek_version" text NOT NULL,
	"verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "webhook_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"excerpt" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "webhook_dispatch_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "webhook_dispatch_webhook_id_event_id_key" UNIQUE("webhook_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "forecast" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"night_id" uuid NOT NULL,
	"baseline" double precision NOT NULL,
	"uplift" double precision NOT NULL,
	"forecast" double precision NOT NULL,
	"band_low" double precision NOT NULL,
	"band_high" double precision NOT NULL,
	"method" text NOT NULL,
	"reading_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ics_feed" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text,
	"filename" text,
	"etag" text,
	"last_modified" text,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "ics_feed_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"listing_key" text NOT NULL,
	"source_url" text NOT NULL,
	"source_revision" text NOT NULL,
	"state" "listing_state" DEFAULT 'proposed' NOT NULL,
	"class" text NOT NULL,
	"class_hint" text,
	"single_source" boolean DEFAULT false NOT NULL,
	"historical" boolean DEFAULT false NOT NULL,
	"night_id" uuid,
	"pending_change" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "listing_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "listing_project_id_listing_key_key" UNIQUE("project_id","listing_key")
);
--> statement-breakpoint
CREATE TABLE "night" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"state" "night_state" DEFAULT 'upcoming' NOT NULL,
	"doors" timestamp with time zone,
	"show" timestamp with time zone,
	"arrival_start" timestamp with time zone,
	"arrival_end" timestamp with time zone,
	"exit_start" timestamp with time zone,
	"exit_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "night_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "share_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"access" "share_access" NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "share_link_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "share_link_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "window" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"kind" "window_kind" NOT NULL,
	"tz" text NOT NULL,
	"declared_by" text NOT NULL,
	"guest" boolean DEFAULT false NOT NULL,
	"via" "window_via" NOT NULL,
	"expires_at" timestamp with time zone,
	"series_id" uuid,
	"ics_feed_id" uuid,
	"cancelled_at" timestamp with time zone,
	"share_link_id" uuid,
	"guest_device_hash" text,
	"guest_ip_hash" text,
	"moderation" "moderation" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "window_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "window_report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"window_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "window_report_window_id_device_hash_key" UNIQUE("window_id","device_hash")
);
--> statement-breakpoint
CREATE TABLE "window_series" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"rule" jsonb NOT NULL,
	"local_start" time NOT NULL,
	"local_end" time NOT NULL,
	"materialised_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "window_series_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD COLUMN "reads_malay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."organization" ADD COLUMN "plan" text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."organization" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."organization" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."organization" ADD COLUMN "onboarding_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."organization" ADD COLUMN "ai_fallback_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."organization" ADD COLUMN "allow_member_ai_keys" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD COLUMN "reauthenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "magic_link_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_key" ADD CONSTRAINT "ai_key_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_run_fk" FOREIGN KEY ("org_id","run_id") REFERENCES "public"."run"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_ai_key_fk" FOREIGN KEY ("org_id","ai_key_id") REFERENCES "public"."ai_key"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_token" ADD CONSTRAINT "guest_token_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_share_link_fk" FOREIGN KEY ("org_id","share_link_id") REFERENCES "public"."share_link"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_org_client" ADD CONSTRAINT "oauth_org_client_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event" ADD CONSTRAINT "domain_event_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_counter" ADD CONSTRAINT "event_counter_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handled_event" ADD CONSTRAINT "handled_event_event_id_domain_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause" ADD CONSTRAINT "clause_sheet_version_fk" FOREIGN KEY ("org_id","sheet_version_id") REFERENCES "public"."sheet_version"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_sheet" ADD CONSTRAINT "clause_sheet_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_sheet" ADD CONSTRAINT "clause_sheet_live_version_fk" FOREIGN KEY ("org_id","live_version_id") REFERENCES "public"."sheet_version"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crossing" ADD CONSTRAINT "crossing_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crossing" ADD CONSTRAINT "crossing_snapshot_fk" FOREIGN KEY ("org_id","snapshot_id") REFERENCES "public"."indicator_snapshot"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_snapshot" ADD CONSTRAINT "indicator_snapshot_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_label" ADD CONSTRAINT "probation_label_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_label" ADD CONSTRAINT "probation_label_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_resolution" ADD CONSTRAINT "probation_resolution_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_resolution" ADD CONSTRAINT "probation_resolution_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_result" ADD CONSTRAINT "replay_result_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_result" ADD CONSTRAINT "replay_result_sheet_version_fk" FOREIGN KEY ("org_id","sheet_version_id") REFERENCES "public"."sheet_version"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_state" ADD CONSTRAINT "shadow_state_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_state" ADD CONSTRAINT "shadow_state_sheet_version_fk" FOREIGN KEY ("org_id","sheet_version_id") REFERENCES "public"."sheet_version"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_version" ADD CONSTRAINT "sheet_version_sheet_fk" FOREIGN KEY ("org_id","sheet_id") REFERENCES "public"."clause_sheet"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_subscriber_fk" FOREIGN KEY ("org_id","subscriber_id") REFERENCES "public"."subscriber"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_reply" ADD CONSTRAINT "crowd_reply_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_reply" ADD CONSTRAINT "crowd_reply_window_fk" FOREIGN KEY ("org_id","window_id") REFERENCES "public"."window"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_reply" ADD CONSTRAINT "crowd_reply_subscriber_fk" FOREIGN KEY ("org_id","subscriber_id") REFERENCES "public"."subscriber"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_subscriber_fk" FOREIGN KEY ("org_id","subscriber_id") REFERENCES "public"."subscriber"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_channel" ADD CONSTRAINT "project_channel_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribe_link" ADD CONSTRAINT "subscribe_link_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber" ADD CONSTRAINT "subscriber_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_token" ADD CONSTRAINT "subscriber_token_subscriber_fk" FOREIGN KEY ("org_id","subscriber_id") REFERENCES "public"."subscriber"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_token" ADD CONSTRAINT "subscriber_token_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_token" ADD CONSTRAINT "subscriber_token_window_fk" FOREIGN KEY ("org_id","window_id") REFERENCES "public"."window"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_metric" ADD CONSTRAINT "analysis_metric_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_night_fk" FOREIGN KEY ("org_id","night_id") REFERENCES "public"."night"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_window_fk" FOREIGN KEY ("org_id","window_id") REFERENCES "public"."window"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_sheet_version_fk" FOREIGN KEY ("org_id","sheet_version_id") REFERENCES "public"."sheet_version"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_corrects_fk" FOREIGN KEY ("org_id","corrects") REFERENCES "public"."ledger_entry"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_grade_fk" FOREIGN KEY ("org_id","grade_id") REFERENCES "public"."grade"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_alert" ADD CONSTRAINT "bundle_alert_bundle_fk" FOREIGN KEY ("org_id","bundle_id") REFERENCES "public"."bundle"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_from_member_id_member_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "auth"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_to_member_id_member_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "auth"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_shift" ADD CONSTRAINT "rota_shift_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_shift" ADD CONSTRAINT "rota_shift_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_reminder" ADD CONSTRAINT "shift_reminder_rota_shift_fk" FOREIGN KEY ("org_id","rota_shift_id") REFERENCES "public"."rota_shift"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_update" ADD CONSTRAINT "incident_update_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_archive" ADD CONSTRAINT "pilot_archive_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_bundle_fk" FOREIGN KEY ("org_id","bundle_id") REFERENCES "public"."bundle"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_listing_fk" FOREIGN KEY ("org_id","listing_id") REFERENCES "public"."listing"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_evidence_request_fk" FOREIGN KEY ("org_id","evidence_request_id") REFERENCES "public"."evidence_request"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_call_fk" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."call"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle" ADD CONSTRAINT "bundle_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle" ADD CONSTRAINT "bundle_run_fk" FOREIGN KEY ("org_id","run_id") REFERENCES "public"."run"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle" ADD CONSTRAINT "bundle_superseded_by_fk" FOREIGN KEY ("org_id","superseded_by") REFERENCES "public"."bundle"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_bundle_fk" FOREIGN KEY ("org_id","bundle_id") REFERENCES "public"."bundle"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_window_fk" FOREIGN KEY ("org_id","window_id") REFERENCES "public"."window"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_night_fk" FOREIGN KEY ("org_id","night_id") REFERENCES "public"."night"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_superseded_by_fk" FOREIGN KEY ("org_id","superseded_by_call_id") REFERENCES "public"."call"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_sheet_version_fk" FOREIGN KEY ("org_id","sheet_version_id") REFERENCES "public"."sheet_version"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_snapshot_fk" FOREIGN KEY ("org_id","snapshot_id") REFERENCES "public"."indicator_snapshot"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step" ADD CONSTRAINT "run_step_run_fk" FOREIGN KEY ("org_id","run_id") REFERENCES "public"."run"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source" ADD CONSTRAINT "project_source_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source" ADD CONSTRAINT "project_source_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_owner_org_id_organization_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_state" ADD CONSTRAINT "source_state_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_dispatch_fk" FOREIGN KEY ("org_id","dispatch_id") REFERENCES "public"."webhook_dispatch"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_fk" FOREIGN KEY ("org_id","event_id") REFERENCES "public"."domain_event"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dispatch" ADD CONSTRAINT "webhook_dispatch_webhook_fk" FOREIGN KEY ("org_id","webhook_id") REFERENCES "public"."webhook"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dispatch" ADD CONSTRAINT "webhook_dispatch_event_fk" FOREIGN KEY ("org_id","event_id") REFERENCES "public"."domain_event"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast" ADD CONSTRAINT "forecast_night_fk" FOREIGN KEY ("org_id","night_id") REFERENCES "public"."night"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ics_feed" ADD CONSTRAINT "ics_feed_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_night_fk" FOREIGN KEY ("org_id","night_id") REFERENCES "public"."night"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night" ADD CONSTRAINT "night_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_series_fk" FOREIGN KEY ("org_id","series_id") REFERENCES "public"."window_series"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_ics_feed_fk" FOREIGN KEY ("org_id","ics_feed_id") REFERENCES "public"."ics_feed"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window" ADD CONSTRAINT "window_share_link_fk" FOREIGN KEY ("org_id","share_link_id") REFERENCES "public"."share_link"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window_report" ADD CONSTRAINT "window_report_window_fk" FOREIGN KEY ("org_id","window_id") REFERENCES "public"."window"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window_series" ADD CONSTRAINT "window_series_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."project"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_key_org_id_idx" ON "ai_key" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_usage_org_id_idx" ON "ai_usage" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "guest_token_org_id_idx" ON "guest_token" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "oauth_grant_org_id_idx" ON "oauth_grant" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "oauth_org_client_org_id_idx" ON "oauth_org_client" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "analytics_event_name_at_idx" ON "analytics_event" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "audit_event_org_id_idx" ON "audit_event" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_event_org_id_at_idx" ON "audit_event" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "domain_event_org_id_idx" ON "domain_event" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "domain_event_unpublished_idx" ON "domain_event" USING btree ("created_at") WHERE "domain_event"."published_at" IS NULL;--> statement-breakpoint
CREATE INDEX "clause_org_id_idx" ON "clause" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "clause_sheet_org_id_idx" ON "clause_sheet" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crossing_org_id_idx" ON "crossing" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "indicator_snapshot_org_id_idx" ON "indicator_snapshot" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "probation_label_org_id_idx" ON "probation_label" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "probation_resolution_org_id_idx" ON "probation_resolution" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "replay_result_org_id_idx" ON "replay_result" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "shadow_state_org_id_idx" ON "shadow_state" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sheet_version_org_id_idx" ON "sheet_version" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "consent_record_org_id_idx" ON "consent_record" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crowd_reply_org_id_idx" ON "crowd_reply" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notice_org_id_idx" ON "notice" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notification_org_id_idx" ON "notification" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notification_preference_org_id_idx" ON "notification_preference" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "plan_feedback_org_id_idx" ON "plan_feedback" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_channel_org_id_idx" ON "project_channel" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "push_subscription_org_id_idx" ON "push_subscription" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscribe_link_org_id_idx" ON "subscribe_link" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriber_org_id_idx" ON "subscriber" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriber_token_org_id_idx" ON "subscriber_token" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "suppression_org_id_idx" ON "suppression" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "analysis_metric_org_id_idx" ON "analysis_metric" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "evidence_request_org_id_idx" ON "evidence_request" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "grade_org_id_idx" ON "grade" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_org_id_idx" ON "ledger_entry" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "review_item_org_id_idx" ON "review_item" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bundle_alert_org_id_idx" ON "bundle_alert" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ownership_transfer_org_id_idx" ON "ownership_transfer" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rota_shift_org_id_idx" ON "rota_shift" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "shift_reminder_org_id_idx" ON "shift_reminder" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pilot_archive_org_id_idx" ON "pilot_archive" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "approval_org_id_idx" ON "approval" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bundle_org_id_idx" ON "bundle" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bundle_project_id_state_idx" ON "bundle" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "call_org_id_idx" ON "call" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "run_org_id_idx" ON "run" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_dedupe_key_key" ON "run" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "run_one_queued_key" ON "run" USING btree ("project_id","pack") WHERE "run"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "run_step_org_id_idx" ON "run_step" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_step_run_id_step_key" ON "run_step" USING btree ("run_id","step");--> statement-breakpoint
CREATE INDEX "project_source_org_id_idx" ON "project_source" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_org_id_idx" ON "webhook" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_org_id_idx" ON "webhook_delivery" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_dispatch_org_id_idx" ON "webhook_dispatch" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "forecast_org_id_idx" ON "forecast" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ics_feed_org_id_idx" ON "ics_feed" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "listing_org_id_idx" ON "listing" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "night_org_id_idx" ON "night" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "share_link_org_id_idx" ON "share_link" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "window_org_id_idx" ON "window" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "window_report_org_id_idx" ON "window_report" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "window_series_org_id_idx" ON "window_series" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "project_pack" ADD CONSTRAINT "project_pack_sheet_fk" FOREIGN KEY ("org_id","sheet_id") REFERENCES "public"."clause_sheet"("org_id","id") ON DELETE no action ON UPDATE no action;