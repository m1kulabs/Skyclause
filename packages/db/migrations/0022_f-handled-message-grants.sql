-- handled_message (S, through #92's system_table): `system` reads and writes it through handleOnce. Runs as `owner`.
SELECT system_table('handled_message'::regclass);
