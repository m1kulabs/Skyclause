#!/bin/sh
# The image's entrypoint (#90): one image, three roles, picked from what Cloud Run sets, so the deploy never sets a
# command. A job runs apps/worker's main.js with its container args (infra/ sets `job <name>`); a job without args
# runs the registry job named like the Cloud Run job.
set -eu

if [ -n "${CLOUD_RUN_JOB:-}" ]; then
  if [ "$#" -gt 0 ]; then exec node apps/worker/dist/main.js "$@"; fi
  exec node apps/worker/dist/main.js job "$CLOUD_RUN_JOB"
fi
case "${K_SERVICE:-}" in
  web) exec node apps/web/server.js ;;
  worker) exec node apps/worker/dist/main.js ;;
esac
echo "container-entry: set K_SERVICE to web or worker, or CLOUD_RUN_JOB to a job name (got K_SERVICE='${K_SERVICE:-}')" >&2
exit 64
