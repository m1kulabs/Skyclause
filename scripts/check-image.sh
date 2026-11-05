#!/usr/bin/env bash
# check-image.sh <image> (#90): checks a built image before it's pushed. It runs as non-root, the web and worker
# roles start and answer /healthz, a job runs through the worker's registry, and APP_ENV=test refuses to start.
set -euo pipefail

image=${1:?usage: check-image.sh <image>}
failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

user=$(docker image inspect --format '{{.Config.User}}' "$image")
uid=$(docker run --rm --entrypoint id "$image" -u)
if [ -z "$user" ] || [ "$user" = root ] || [ "$uid" = 0 ]; then
  fail "the image runs as root (USER '$user', uid $uid)"
else
  echo "ok   runs as $user (uid $uid)"
fi

# serves <role> <env...>: starts the role and waits up to 30 s for /healthz to answer ok.
serves() {
  local role=$1 container port body=''
  shift
  container=$(docker run -d --rm -p 127.0.0.1::8080 -e "K_SERVICE=$role" "$@" "$image")
  port=$(docker port "$container" 8080/tcp | head -n1 | cut -d: -f2)
  for _ in $(seq 30); do
    body=$(curl -fsS "http://127.0.0.1:$port/healthz" 2>/dev/null) && break
    sleep 1
  done
  if [ "$body" = ok ]; then
    echo "ok   $role answers /healthz"
  else
    fail "$role didn't answer /healthz with ok; its log:"
    docker logs "$container" >&2 || true
  fi
  docker stop "$container" >/dev/null || true
}

serves web -e APP_ENV=production
serves worker -e APP_ENV=production -e WORKER_URL=https://worker.example.test \
  -e WORKER_INVOKER_SA=skyclause-invoker@skyclause.iam.gserviceaccount.com

# exits <expected stderr> <env...>: the container exits non-zero and says why.
exits() {
  local expected=$1 output status=0
  shift
  output=$(docker run --rm "$@" "$image" 2>&1) || status=$?
  if [ "$status" -ne 0 ] && grep -q -- "$expected" <<<"$output"; then
    echo "ok   exits $status: $expected"
  else
    fail "expected a non-zero exit naming '$expected', got $status: $output"
  fi
}

exits 'unknown job no-such-job' -e CLOUD_RUN_JOB=no-such-job -e APP_ENV=production
exits 'APP_ENV=test is refused on Cloud Run' -e K_SERVICE=web -e APP_ENV=test
exits 'K_SERVICE' -e APP_ENV=production

[ "$failures" -eq 0 ] || exit 1
