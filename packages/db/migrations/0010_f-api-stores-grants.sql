-- f-api's stores (#79 §3, S): `system` reads and writes them through withSystem (#93); `retention` sweeps expired
-- rows (#112). No other login has a grant, so neither needs row-level security. Runs as `owner`.
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_key, rate_limit TO "system";
GRANT SELECT, DELETE ON idempotency_key, rate_limit TO retention;
