-- #94 ticket decision: a credential held in a T table (a `skg_` guest token, an `sc_share` link, an OAuth grant) is
-- presented before any organisation is known. credential_owner() maps it to the live row's organisation and ID only;
-- resolvePrincipal then reads the row through withTenant. Only auth_app, the login resolvePrincipal uses, may call it.
-- Runs as `owner`, whose RLS is forced on these tables, so the function's reads need owner-only policies.
CREATE POLICY credential_owner ON guest_token FOR SELECT TO "owner" USING (true);
--> statement-breakpoint
CREATE POLICY credential_owner ON share_link FOR SELECT TO "owner" USING (true);
--> statement-breakpoint
CREATE POLICY credential_owner ON oauth_grant FOR SELECT TO "owner" USING (true);
--> statement-breakpoint

-- `p_key` is the SHA-256 hex of a guest or share token, or an OAuth grant's ID; an expired or revoked row gives none.
CREATE FUNCTION auth.credential_owner(p_kind text, p_key text) RETURNS TABLE (org_id uuid, id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  CASE p_kind
    WHEN 'guest_token' THEN
      RETURN QUERY SELECT t.org_id, t.id FROM guest_token t WHERE t.token_hash = p_key AND t.expires_at > now();
    WHEN 'share_link' THEN
      RETURN QUERY SELECT t.org_id, t.id FROM share_link t
        WHERE t.token_hash = p_key AND t.revoked_at IS NULL AND t.expires_at > now();
    WHEN 'oauth_grant' THEN
      IF p_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN QUERY SELECT t.org_id, t.id FROM oauth_grant t WHERE t.id = p_key::uuid AND t.revoked_at IS NULL;
      END IF;
  END CASE;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.credential_owner(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.credential_owner(text, text) TO auth_app;
