-- #103 a-members-api forces RLS on auth.member and auth.invitation; a-data-rights (#109) erases and exports an
-- account's rows there as `retention`, so both get the `retention` policy every tenant table has. Runs as `owner`.
CREATE POLICY retention ON auth.member TO retention USING (true);
CREATE POLICY retention ON auth.invitation TO retention USING (true);
