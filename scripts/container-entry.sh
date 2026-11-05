#!/bin/sh
# The image's entrypoint (#90): one image, three roles, picked from what Cloud Run sets, so neither Terraform nor
# the deploy sets a command. A job runs the worker registry's job of the same name as the Cloud Run job.
set -eu

if [ -n "${CLOUD_RUN_JOB:-}" ]; then
  exec node apps/worker/dist/main.js job "$CLOUD_RUN_JOB" "$@"
fi
case "${K_SERVICE:-}" in
  web) exec node apps/web/server.js ;;
  worker) exec node apps/worker/dist/main.js ;;
esac
echo "container-entry: set K_SERVICE to web or worker, or CLOUD_RUN_JOB to a job name (got K_SERVICE='${K_SERVICE:-}')" >&2
exit 64
