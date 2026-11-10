-- CLS-7 covers system defaults and human publications; draft promotion remains permitted.
-- Match append_only()'s authoritative retention-role guard for erasure DELETE only.
CREATE FUNCTION reject_published_sheet_version_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF TG_OP = 'DELETE' AND (current_user = 'retention' OR session_user = 'retention') THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'published sheet versions are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sheet_version_published_immutable
BEFORE UPDATE OR DELETE ON sheet_version
FOR EACH ROW EXECUTE FUNCTION reject_published_sheet_version_change();
