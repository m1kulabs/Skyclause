-- #92: the partitioned tables, pg_partman, RLS per #79 §3's letters, append-only triggers, the public_* views and the
-- SECURITY DEFINER writes behind emitEvent and track. TRD "Tenancy, append-only tables and partitions". Runs as `owner`.

-- pg_partman is the migrator login's, as on Neon (its control file says `superuser = false`). Neon ships 5.1.0, so only
-- 5.1's API is used here. `owner` gets what create_parent and run_maintenance need, so partitions are owner's.
RESET ROLE;
CREATE SCHEMA partman;
CREATE EXTENSION pg_partman SCHEMA partman;
GRANT USAGE ON SCHEMA partman TO "owner";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA partman TO "owner";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA partman TO "owner";
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA partman TO "owner";
SET LOCAL ROLE "owner";
--> statement-breakpoint

-- poll and reading (TRD), by hand because drizzle-kit 0.31 can't emit PARTITION BY; src/schema/partitioned.ts mirrors
-- them. Every unique index holds the partition key, so no partman template table is needed.
CREATE TABLE poll (
  id uuid NOT NULL DEFAULT uuidv7(),
  source_id uuid NOT NULL REFERENCES source (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  http_status integer,
  latency_ms integer NOT NULL,
  outcome text NOT NULL,
  error_code text,
  message text,
  PRIMARY KEY (id, started_at)
) PARTITION BY RANGE (started_at);
CREATE INDEX poll_source_id_started_at_idx ON poll (source_id, started_at DESC);

CREATE TABLE reading (
  id uuid NOT NULL DEFAULT uuidv7(),
  source_id uuid NOT NULL REFERENCES source (id) ON DELETE CASCADE,
  poll_id uuid,
  metric text NOT NULL,
  unit text,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  value double precision,
  value_text text,
  value_json jsonb,
  device_time timestamptz,
  item_key text,
  revision integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id, observed_at),
  CONSTRAINT reading_dedupe_key UNIQUE NULLS NOT DISTINCT (source_id, metric, observed_at, item_key, revision)
) PARTITION BY RANGE (observed_at);
CREATE INDEX reading_source_id_metric_observed_at_idx ON reading (source_id, metric, observed_at DESC);
CREATE INDEX reading_received_at_brin ON reading USING brin (received_at);

-- Monthly partitions, three premade ahead (and three behind, create_parent's default), and a default partition for rows
-- outside them. infinite_time_partitions keeps premaking from now() even while a table is empty. The worker's batch
-- runs partition_maintenance() hourly (below; no pg_cron, D45).
SELECT partman.create_parent('public.poll', 'started_at', '1 month', p_premake := 3, p_template_table := 'false',
  p_jobmon := false);
SELECT partman.create_parent('public.reading', 'observed_at', '1 month', p_premake := 3, p_template_table := 'false',
  p_jobmon := false);
UPDATE partman.part_config SET infinite_time_partitions = true WHERE parent_table IN ('public.poll', 'public.reading');
--> statement-breakpoint

-- run_maintenance_proc() COMMITs between partition sets, so it can run neither inside a with* transaction nor in a
-- SECURITY DEFINER function; this runs run_maintenance(), the function the proc calls per set, as owner, for `system`.
CREATE FUNCTION partition_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM partman.run_maintenance(p_jobmon := false);
END
$$;
REVOKE EXECUTE ON FUNCTION partition_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partition_maintenance() TO "system";
--> statement-breakpoint

-- G (#79 §3): every role reads; `system` writes (staff writes run as system, D30); retention sweeps (component_check's
-- 90 days).
CREATE FUNCTION global_table(t regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY read ON %s FOR SELECT USING (true)', t);
  EXECUTE format('CREATE POLICY "system" ON %s TO "system" USING (true)', t);
  EXECUTE format('CREATE POLICY retention ON %s TO retention USING (true)', t);
  EXECUTE format('GRANT SELECT ON %s TO app, public_reader', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO "system"', t);
  EXECUTE format('GRANT SELECT, UPDATE, DELETE ON %s TO retention', t);
END
$$;

-- S (#79 §3): `system` and `retention` only. A nullable org_id scopes system's rows inside withTenant.
CREATE FUNCTION system_table(t regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
  IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = t AND attname = 'org_id' AND NOT attisdropped) THEN
    EXECUTE format('CREATE POLICY "system" ON %s TO "system" USING (current_org_id() IS NULL OR org_id = current_org_id())', t);
  ELSE
    EXECUTE format('CREATE POLICY "system" ON %s TO "system" USING (true)', t);
  END IF;
  EXECUTE format('CREATE POLICY retention ON %s TO retention USING (true)', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO "system"', t);
  EXECUTE format('GRANT SELECT, UPDATE, DELETE ON %s TO retention', t);
END
$$;

-- C (#79 §3, TRD tenancy): a catalogue source (owner_org_id NULL) and its polls, readings and state are readable by every
-- role, a device source's only inside its organisation. Writes: withSystem (no organisation) writes catalogue rows,
-- withTenant its own device rows. A child's rows follow the caller's own policies on `source`.
CREATE FUNCTION catalogue_child_table(t regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY read ON %s FOR SELECT USING (source_id IN (SELECT id FROM source))', t);
  EXECUTE format('CREATE POLICY write ON %s USING (source_id IN (SELECT id FROM source '
    'WHERE owner_org_id IS NOT DISTINCT FROM current_org_id()))', t);
  EXECUTE format('CREATE POLICY retention ON %s TO retention USING (true)', t);
  EXECUTE format('GRANT SELECT ON %s TO app, "system", public_reader, retention', t);
  EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %s TO app, "system"', t);
  EXECUTE format('GRANT UPDATE, DELETE ON %s TO retention', t);
END
$$;

REVOKE EXECUTE ON FUNCTION global_table(regclass), system_table(regclass), catalogue_child_table(regclass) FROM PUBLIC;
--> statement-breakpoint

ALTER TABLE source ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY read ON source FOR SELECT USING (owner_org_id IS NULL OR owner_org_id = current_org_id());
CREATE POLICY write ON source USING (owner_org_id IS NOT DISTINCT FROM current_org_id());
-- withSystem reads every source, device ones too (and so every poll and reading), for the batch and the auditor.
CREATE POLICY system_read ON source FOR SELECT TO "system" USING (current_org_id() IS NULL);
CREATE POLICY retention ON source TO retention USING (true);
GRANT SELECT ON source TO app, "system", public_reader, retention;
GRANT INSERT, UPDATE, DELETE ON source TO app, "system";
GRANT UPDATE, DELETE ON source TO retention;
SELECT catalogue_child_table('poll');
SELECT catalogue_child_table('reading');
SELECT catalogue_child_table('source_state');
--> statement-breakpoint

SELECT global_table(t) FROM unnest(ARRAY['verification', 'guest_block', 'incident', 'incident_update',
  'component_check']::regclass[]) AS t;
SELECT system_table(t) FROM unnest(ARRAY['analytics_event', 'event_counter', 'handled_event', 'idempotency_key',
  'rate_limit', 'export_job', 'guest_budget']::regclass[]) AS t;
SELECT tenant_table(t) FROM unnest(ARRAY['oauth_grant', 'oauth_org_client', 'guest_token', 'ai_key', 'ai_usage',
  'audit_event', 'domain_event', 'clause_sheet', 'sheet_version', 'clause', 'replay_result', 'indicator_snapshot',
  'shadow_state', 'crossing', 'probation_label', 'probation_resolution', 'project_channel', 'subscriber',
  'subscriber_token', 'subscribe_link', 'consent_record', 'suppression', 'notice', 'crowd_reply', 'plan_feedback',
  'notification', 'notification_preference', 'push_subscription', 'grade', 'review_item', 'evidence_request',
  'analysis_metric', 'ledger_entry', 'ownership_transfer', 'rota_shift', 'shift_reminder', 'bundle_alert',
  'pilot_archive', 'run', 'run_step', 'bundle', 'call', 'approval', 'project_source', 'webhook', 'webhook_dispatch',
  'webhook_delivery', 'share_link', 'window_series', 'ics_feed', 'window', 'window_report', 'night', 'listing',
  'forecast']::regclass[]) AS t;
--> statement-breakpoint

-- Append-only (#79 §3): TRD's eleven and the ten §3 adds.
SELECT attach_append_only(t) FROM unnest(ARRAY['poll', 'reading', 'indicator_snapshot', 'crossing', 'approval',
  'forecast', 'grade', 'ledger_entry', 'audit_event', 'webhook_delivery', 'ai_usage', 'consent_record',
  'analytics_event', 'shift_reminder', 'bundle_alert', 'probation_label', 'probation_resolution', 'crowd_reply',
  'plan_feedback', 'incident_update', 'component_check']::regclass[]) AS t;
--> statement-breakpoint

-- domain_event (#79 §5): only published_at may change, and only retention deletes (the 30-day sweep, #112).
CREATE FUNCTION domain_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.org_id, NEW.project_id, NEW.seq, NEW.type, NEW.data, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.org_id, OLD.project_id, OLD.seq, OLD.type, OLD.data, OLD.created_at)
    AND current_user <> 'retention' AND session_user <> 'retention' THEN
    RAISE EXCEPTION 'UPDATE on public.domain_event may change only published_at'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER domain_event_guard BEFORE UPDATE ON domain_event FOR EACH ROW EXECUTE FUNCTION domain_event_guard();
CREATE TRIGGER append_only BEFORE DELETE ON domain_event FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON domain_event FOR EACH STATEMENT EXECUTE FUNCTION append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON domain_event FROM app, "system";
GRANT UPDATE (published_at) ON domain_event TO app, "system";
-- The dispatcher and the republish read and mark events across organisations in withSystem.
CREATE POLICY system_read ON domain_event FOR SELECT TO "system" USING (current_org_id() IS NULL);
CREATE POLICY system_publish ON domain_event FOR UPDATE TO "system" USING (current_org_id() IS NULL);
--> statement-breakpoint

-- emitEvent's seq (ticket decision: S writes from tenant transactions go through SECURITY DEFINER functions, so `app`
-- never reads event_counter). The row lock is held to commit, so a project's seq order is its commit order.
CREATE POLICY next_event_seq ON event_counter TO "owner" USING (true);
CREATE FUNCTION next_event_seq(p_project_id uuid) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public AS $$
DECLARE
  seq bigint;
BEGIN
  IF NOT EXISTS (SELECT FROM project WHERE id = p_project_id AND org_id = current_org_id()) THEN
    RAISE EXCEPTION 'project % is not in this transaction''s organisation', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO event_counter AS c (project_id, last_seq) VALUES (p_project_id, 1)
    ON CONFLICT (project_id) DO UPDATE SET last_seq = c.last_seq + 1
    RETURNING c.last_seq INTO seq;
  RETURN seq;
END
$$;
REVOKE EXECUTE ON FUNCTION next_event_seq(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_event_seq(uuid) TO app, "system";

-- track()'s insert, in the transaction's organisation (or none); `app` never reads analytics_event.
CREATE POLICY track_event ON analytics_event FOR INSERT TO "owner" WITH CHECK (org_id IS NOT DISTINCT FROM current_org_id());
CREATE FUNCTION track_event(p_name text, p_props jsonb, p_project_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT FROM project WHERE id = p_project_id AND org_id = current_org_id()) THEN
    RAISE EXCEPTION 'project % is not in this transaction''s organisation', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO analytics_event (org_id, project_id, name, props) VALUES (current_org_id(), p_project_id, p_name, p_props);
END
$$;
REVOKE EXECUTE ON FUNCTION track_event(text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_event(text, jsonb, uuid) TO app, "system";
--> statement-breakpoint

-- P (#79 §3): public projects' calls, grades and ledger through views run as owner, as for project in 0002.
CREATE POLICY public_read ON "call" FOR SELECT TO "owner" USING (project_id IN (SELECT id FROM project WHERE public));
CREATE POLICY public_read ON grade FOR SELECT TO "owner" USING (project_id IN (SELECT id FROM project WHERE public));
CREATE POLICY public_read ON ledger_entry FOR SELECT TO "owner"
  USING (project_id IN (SELECT id FROM project WHERE public));

CREATE VIEW public_call WITH (security_barrier) AS
  SELECT c.id, c.org_id, c.project_id, c.bundle_id, c.window_id, c.night_id, c.mode, c.watch, c.no_call, c.fired,
    c.shadow, c.chosen, c.agrees, c.decision, c.state, c.superseded_by_call_id, c.ics_uid, c.ics_sequence,
    c.expires_at, c.triggered_at, c.drafted_at, c.approved_at, c.sent_at
  FROM "call" c JOIN project p ON p.id = c.project_id
  WHERE p.public;

CREATE VIEW public_grade WITH (security_barrier) AS
  SELECT g.id, g.org_id, g.project_id, g.pack, g.call_id, g.night_id, g.window_id, g.sheet_version_id, g.outcome,
    g.proposed_mode, g.observed_mode, g.mode_diff, g.no_call, g.agrees, g.stale_inputs, g.created_at
  FROM grade g JOIN project p ON p.id = g.project_id
  WHERE p.public;

CREATE VIEW public_ledger_entry WITH (security_barrier) AS
  SELECT l.id, l.org_id, l.project_id, l.seq, l.kind, l.refs, l.body, l.prev_hash, l.hash, l.at, l.corrects
  FROM ledger_entry l JOIN project p ON p.id = l.project_id
  WHERE p.public;

GRANT SELECT ON public_call, public_grade, public_ledger_entry TO public_reader;
