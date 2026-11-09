-- f-api's stores (#79 §3, S, through #92's system_table): `system` reads and writes them through withSystem (#93);
-- `retention` sweeps expired rows (#112). Neither has an org_id, so system's policy admits every row. Runs as `owner`.
SELECT system_table(t) FROM unnest(ARRAY['idempotency_key', 'rate_limit']::regclass[]) AS t;
