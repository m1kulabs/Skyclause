-- Custom SQL migration file, put your code below!
-- e-byok-api: the AI settings PATCH writes only these two Better Auth columns; the app and system logins keep SELECT
-- on the row and gain UPDATE on the two flags, never on Better Auth's own columns.
GRANT UPDATE (ai_fallback_enabled, allow_member_ai_keys) ON auth.organization TO app, "system";
