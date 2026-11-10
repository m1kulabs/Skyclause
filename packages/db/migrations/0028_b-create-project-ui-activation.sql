CREATE VIEW onboarding_activation WITH (security_barrier = true, security_invoker = true) AS
WITH first_project AS (
  SELECT DISTINCT ON (org_id)
    org_id,
    project_id,
    at AS project_created_at
  FROM analytics_event
  WHERE name = 'project_created' AND project_id IS NOT NULL
  ORDER BY org_id, at, project_id, id
), organisation_events AS (
  SELECT
    org_id,
    min(at) FILTER (WHERE name = 'org_created') AS org_created_at,
    min(at) FILTER (WHERE name = 'source_bound') AS source_bound_at,
    min(at) FILTER (WHERE name = 'rota_set') AS rota_set_at,
    min(at) FILTER (WHERE name = 'channel_connected') AS channel_connected_at
  FROM analytics_event
  GROUP BY org_id
), first_project_events AS (
  SELECT
    first_project.org_id,
    first_project.project_id,
    first_project.project_created_at,
    min(analytics_event.at) FILTER (WHERE analytics_event.name = 'window_declared') AS window_declared_at,
    min(analytics_event.at) FILTER (WHERE analytics_event.name = 'call_graded') AS call_graded_at
  FROM first_project
  LEFT JOIN analytics_event
    ON analytics_event.org_id = first_project.org_id
    AND analytics_event.project_id = first_project.project_id
  GROUP BY first_project.org_id, first_project.project_id, first_project.project_created_at
)
SELECT
  organisation.id AS org_id,
  first_project_events.project_id AS first_project_id,
  organisation_events.org_created_at,
  first_project_events.project_created_at,
  organisation_events.source_bound_at,
  first_project_events.window_declared_at,
  organisation_events.rota_set_at,
  organisation_events.channel_connected_at,
  first_project_events.call_graded_at,
  (
    organisation_events.org_created_at IS NOT NULL
    AND first_project_events.window_declared_at IS NOT NULL
    AND first_project_events.call_graded_at IS NOT NULL
    AND first_project_events.call_graded_at >= first_project_events.window_declared_at
    AND first_project_events.call_graded_at <= organisation_events.org_created_at + interval '7 days'
  ) AS activated
FROM auth.organization AS organisation
LEFT JOIN organisation_events ON organisation_events.org_id = organisation.id
LEFT JOIN first_project_events ON first_project_events.org_id = organisation.id;--> statement-breakpoint
REVOKE ALL ON onboarding_activation FROM PUBLIC, app, auth_app, public_reader, retention;--> statement-breakpoint
GRANT SELECT ON onboarding_activation TO "system";
