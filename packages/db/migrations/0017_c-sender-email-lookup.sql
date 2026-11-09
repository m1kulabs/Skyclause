-- c-sender-email (#158): the sender's batch sweep and `/ses/events` start from no organisation (a sweep across them, an
-- SES message ID), so `withSystem` may read `notice` to find each row's organisation, as 0002 lets it read `project`.
-- Writes stay per tenant.
CREATE POLICY system_read ON notice FOR SELECT TO "system" USING (current_org_id() IS NULL);
