-- #103: the app login may read auth rows but writes them only through tenant-scoped functions.
RESET ROLE;
SET LOCAL ROLE "owner";

CREATE POLICY member_write_functions ON auth.member TO "owner" USING (true) WITH CHECK (true);
CREATE POLICY invitation_write_functions ON auth.invitation TO "owner" USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON auth.member, auth.invitation FROM app;

CREATE FUNCTION auth.member_insert(p_user_id uuid, p_role text, p_created_at timestamptz)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, auth, public AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF public.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'member writes need an organisation context' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO auth.member (organization_id, user_id, role, created_at)
    VALUES (public.current_org_id(), p_user_id, p_role, p_created_at)
    RETURNING id INTO inserted_id;
  RETURN inserted_id;
END
$$;
--> statement-breakpoint

CREATE FUNCTION auth.member_update(p_id uuid, p_role text, p_reads_malay boolean)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, auth, public AS $$
DECLARE
  affected integer;
BEGIN
  IF public.current_org_id() IS NULL OR (p_role IS NULL AND p_reads_malay IS NULL) THEN
    RETURN false;
  END IF;
  UPDATE auth.member
    SET role = coalesce(p_role, role), reads_malay = coalesce(p_reads_malay, reads_malay)
    WHERE id = p_id AND organization_id = public.current_org_id();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END
$$;
--> statement-breakpoint

CREATE FUNCTION auth.member_delete(p_id uuid)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, auth, public AS $$
DECLARE
  affected integer;
BEGIN
  IF public.current_org_id() IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM auth.member WHERE id = p_id AND organization_id = public.current_org_id();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END
$$;
--> statement-breakpoint

CREATE FUNCTION auth.invitation_insert(
  p_email text,
  p_role text,
  p_expires_at timestamptz,
  p_inviter_id uuid,
  p_token_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, auth, public AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF public.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'invitation writes need an organisation context' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO auth.invitation (organization_id, email, role, status, expires_at, inviter_id, token_hash)
    VALUES (public.current_org_id(), p_email, p_role, 'pending', p_expires_at, p_inviter_id, p_token_hash)
    RETURNING id INTO inserted_id;
  RETURN inserted_id;
END
$$;
--> statement-breakpoint

CREATE FUNCTION auth.invitation_set_status(p_id uuid, p_status text)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, auth, public AS $$
DECLARE
  affected integer;
BEGIN
  IF public.current_org_id() IS NULL THEN
    RETURN false;
  END IF;
  UPDATE auth.invitation SET status = p_status
    WHERE id = p_id AND organization_id = public.current_org_id();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION auth.member_insert(uuid, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.member_update(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.member_delete(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.invitation_insert(text, text, timestamptz, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.invitation_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.member_insert(uuid, text, timestamptz) TO app;
GRANT EXECUTE ON FUNCTION auth.member_update(uuid, text, boolean) TO app;
GRANT EXECUTE ON FUNCTION auth.member_delete(uuid) TO app;
GRANT EXECUTE ON FUNCTION auth.invitation_insert(text, text, timestamptz, uuid, text) TO app;
GRANT EXECUTE ON FUNCTION auth.invitation_set_status(uuid, text) TO app;

RESET ROLE;
