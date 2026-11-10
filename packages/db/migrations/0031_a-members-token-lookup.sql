-- #103: token hashes resolve to their tenant before a signed-in accept can enter withTenant.
RESET ROLE;
SET LOCAL ROLE "owner";
CREATE POLICY member_token_lookup ON ownership_transfer FOR SELECT TO "system" USING (current_org_id() IS NULL);
RESET ROLE;
