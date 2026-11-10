-- #111 (a-analytics): PRODUCT product-health views. Plain views read their tables as `owner`, held to RLS with the
-- caller's `app.org_id`, so each aggregates the transaction's organisation; queried inside `withTenant` as a system
-- principal (`withSystem('…')` sees no T rows). The grants let only `system` read them. Runs as `owner`.

CREATE VIEW weekly_approvers WITH (security_barrier) AS
  SELECT a.org_id,
    date_trunc('week', a.created_at)::date AS week_start,
    count(DISTINCT a.actor_id)::integer AS approvers,
    (SELECT count(*)::integer FROM rota_shift r
      WHERE r.org_id = a.org_id AND r.template IN ('storm_afternoon', 'surge_night')) AS rota_slots
  FROM approval a
  WHERE a.bundle_id IS NOT NULL AND a.action IN ('approve', 'edit', 'reject')
  GROUP BY a.org_id, date_trunc('week', a.created_at)::date;
--> statement-breakpoint
CREATE VIEW bundles_past_sla WITH (security_barrier) AS
  SELECT b.org_id, b.id AS bundle_id, b.project_id, b.pack, b.state, b.escalation_level, b.sla_due_at,
    CASE WHEN b.escalation_level > 0 THEN 'escalated' ELSE 'expired_unescalated' END AS reason
  FROM bundle b
  WHERE b.escalation_level > 0 OR (b.state = 'expired' AND b.escalation_level = 0);
--> statement-breakpoint
CREATE VIEW signal_health WITH (security_barrier) AS
  WITH hours AS (
    SELECT p.source_id, date_trunc('hour', p.started_at) AS hour,
      bool_or(p.error_code IS NOT NULL OR (p.http_status IS NOT NULL AND p.http_status >= 500)) AS errored,
      bool_or(p.outcome <> 'ok') AS not_ok
    FROM poll p
    GROUP BY p.source_id, date_trunc('hour', p.started_at)
  ),
  classified AS (
    SELECT source_id, hour,
      CASE WHEN errored THEN 'error' WHEN not_ok THEN 'stale' ELSE 'fresh' END AS state
    FROM hours
  )
  SELECT s.id AS source_id, ss.state AS current_state, ss.since AS state_since,
    count(c.hour)::integer AS hours_total,
    count(*) FILTER (WHERE c.state = 'fresh')::integer AS hours_fresh,
    count(*) FILTER (WHERE c.state = 'stale')::integer AS hours_stale,
    count(*) FILTER (WHERE c.state = 'error')::integer AS hours_error,
    (count(*) FILTER (WHERE c.state = 'fresh'))::double precision / NULLIF(count(c.hour), 0) AS share_fresh,
    (count(*) FILTER (WHERE c.state = 'stale'))::double precision / NULLIF(count(c.hour), 0) AS share_stale,
    (count(*) FILTER (WHERE c.state = 'error'))::double precision / NULLIF(count(c.hour), 0) AS share_error
  FROM source s
  LEFT JOIN source_state ss ON ss.source_id = s.id
  LEFT JOIN classified c ON c.source_id = s.id
  GROUP BY s.id, ss.state, ss.since;
--> statement-breakpoint
GRANT SELECT ON weekly_approvers, bundles_past_sla, signal_health TO "system";
