# The dev and CI database (TRD environments): Postgres 18 with pg_partman from PGDG (its control file says
# `superuser = false`, so `migrator` may create it, as on Neon), and no pg_cron (D45). The base is pinned by its
# multi-platform index digest, like the app image.
FROM postgres:18.6-trixie@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-18-partman \
  && rm -rf /var/lib/apt/lists/*
COPY init.sql /docker-entrypoint-initdb.d/
