# One image for web, worker and every Cloud Run job (#90); scripts/container-entry.sh picks the role.
# Bases are pinned by their multi-platform index digest (TRD security):
# node:22-slim (Debian bookworm) and oven/bun:1.4.4-slim, which only supplies the Bun binary to the build.
# Bun gets its own stage because Dependabot reads FROM lines only (#267).

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS bun

FROM node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --filter './apps/*' build
# /out is the runtime tree: the web standalone server, the worker bundle (its package.json makes main.js ESM),
# web's public files, and apps/docs's static export under /docs/ (#79 §4 Hosts), once apps/docs builds one (#210).
RUN mkdir -p /out/apps/worker /out/apps/web/public \
  && cp -R apps/web/.next/standalone/. /out/ \
  && cp -R apps/worker/dist apps/worker/package.json /out/apps/worker/ \
  && if [ -d apps/web/public ]; then cp -R apps/web/public/. /out/apps/web/public/; fi \
  && if node -e "process.exit(require('./apps/docs/package.json').scripts?.build ? 0 : 1)"; then \
       cp -R apps/docs/out /out/apps/web/public/docs; \
     fi \
  && cp scripts/container-entry.sh /out/container-entry.sh

FROM node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=build /out/ ./
# Next writes its cache under .next; everything else stays owned by root.
RUN chown -R node:node apps/web/.next
USER node
ENTRYPOINT ["/app/container-entry.sh"]
