# The dev and CI database (TRD environments): Postgres 18 with pg_partman installed as on Neon, and no pg_cron (D45).
# Neon offers only pg_partman 5.1.0, built from this tarball and checksum with `trusted = true` appended to its control
# file (neondatabase/neon compute/compute-node.Dockerfile), so `CREATE EXTENSION` by migrator runs as the superuser and
# partman's tables are the superuser's, not migrator's. PGDG ships no 5.1.0 for Postgres 18. Without the background
# worker, which isn't used, the extension is SQL only: its Makefile concatenates these files. The base is pinned by its
# multi-platform index digest, like the app image.
FROM postgres:18.6-trixie@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42 AS partman
ADD --checksum=sha256:3e3a27d7ff827295d5c55ef72f07a49062d6204b3cb0b9a048645d6db9f3cb9f \
  https://github.com/pgpartman/pg_partman/archive/refs/tags/v5.1.0.tar.gz /tmp/pg_partman.tar.gz
RUN mkdir /out && tar -xzf /tmp/pg_partman.tar.gz -C /tmp && cd /tmp/pg_partman-5.1.0 \
  && LC_ALL=C sh -c 'cat sql/types/*.sql sql/tables/*.sql sql/functions/*.sql sql/procedures/*.sql' > /out/pg_partman--5.1.0.sql \
  && cp pg_partman.control /out/ && echo 'trusted = true' >> /out/pg_partman.control

FROM postgres:18.6-trixie@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
COPY --from=partman /out/ /usr/share/postgresql/18/extension/
COPY init.sql /docker-entrypoint-initdb.d/
