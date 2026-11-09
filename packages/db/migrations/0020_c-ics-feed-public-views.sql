-- c-ics-feed (#154): the conditions calendar reads as public_reader (P, #79 §3), as public_call does in 0004. Each view
-- holds only the columns the feed reads and the rows it may show: a public project's bundles, windows and nights that
-- a sent call refers to, without draft-only bundles or guest windows (GST-5, D23) or nights never listed (CAL-14), and
-- of those nights' listings only `listed` and `cancelled` ones. The owner policies let the views, which run as owner,
-- see public rows. c-ics-feed's consumer applies the same exclusions on the tables when it assigns identities.
CREATE POLICY public_read ON bundle FOR SELECT TO "owner" USING (project_id IN (SELECT id FROM project WHERE public));
CREATE POLICY public_read ON "window" FOR SELECT TO "owner" USING (project_id IN (SELECT id FROM project WHERE public));
CREATE POLICY public_read ON night FOR SELECT TO "owner" USING (project_id IN (SELECT id FROM project WHERE public));
CREATE POLICY public_read ON listing FOR SELECT TO "owner" USING (project_id IN (SELECT id FROM project WHERE public));

CREATE VIEW public_bundle WITH (security_barrier) AS
  SELECT b.id, b.pack
  FROM bundle b JOIN project p ON p.id = b.project_id
  WHERE p.public AND NOT b.draft_only
    AND EXISTS (SELECT FROM "call" c WHERE c.bundle_id = b.id AND c.state = 'sent');

CREATE VIEW public_window WITH (security_barrier) AS
  SELECT w.id, w.starts_at, w.ends_at, w.cancelled_at, w.updated_at
  FROM "window" w JOIN project p ON p.id = w.project_id
  WHERE p.public AND NOT w.guest
    AND EXISTS (SELECT FROM "call" c WHERE c.window_id = w.id AND c.state = 'sent');

CREATE VIEW public_night WITH (security_barrier) AS
  SELECT n.id, n.state, n.arrival_start, n.arrival_end, n.exit_end, n.updated_at
  FROM night n JOIN project p ON p.id = n.project_id
  WHERE p.public
    AND EXISTS (SELECT FROM "call" c WHERE c.night_id = n.id AND c.state = 'sent')
    AND EXISTS (SELECT FROM listing l WHERE l.night_id = n.id AND l.state IN ('listed', 'cancelled'));

CREATE VIEW public_listing WITH (security_barrier) AS
  SELECT l.night_id, l.state
  FROM listing l JOIN project p ON p.id = l.project_id
  WHERE p.public AND l.state IN ('listed', 'cancelled')
    AND EXISTS (SELECT FROM "call" c WHERE c.night_id = l.night_id AND c.state = 'sent');

GRANT SELECT ON public_bundle, public_window, public_night, public_listing TO public_reader;
--> statement-breakpoint

-- Appended columns, the rest unchanged: a call's last change, which is the feed's DTSTAMP and Last-Modified once the
-- `ics` consumer raises a SEQUENCE; and whether the project's organisation is `suspended` (projectGate's
-- `deletion_requested_at`), whose feed 404s (D20). Grants stay with the views.
CREATE OR REPLACE VIEW public_call WITH (security_barrier) AS
  SELECT c.id, c.org_id, c.project_id, c.bundle_id, c.window_id, c.night_id, c.mode, c.watch, c.no_call, c.fired,
    c.shadow, c.chosen, c.agrees, c.decision, c.state, c.superseded_by_call_id, c.ics_uid, c.ics_sequence,
    c.expires_at, c.triggered_at, c.drafted_at, c.approved_at, c.sent_at, c.updated_at
  FROM "call" c JOIN project p ON p.id = c.project_id
  WHERE p.public AND c.approved_at IS NOT NULL;

CREATE OR REPLACE VIEW public_project WITH (security_barrier) AS
  SELECT p.id, p.org_id, o.slug AS org_slug, p.slug, p.name, p.time_zone, p.site_name, p.site_lat, p.site_lon,
    p.archived_at, o.deletion_requested_at IS NOT NULL AS suspended
  FROM project p
  JOIN auth.organization o ON o.id = p.org_id
  WHERE p.public;
