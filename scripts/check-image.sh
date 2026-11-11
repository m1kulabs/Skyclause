#!/usr/bin/env bash
# check-image.sh <image> (#90): checks a built image before it's pushed. It runs as non-root, the web and worker
# roles start and answer /health, a job runs through the worker's registry, and APP_ENV=test refuses to start.
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

container=''
cleanup() {
  if [ -n "$container" ]; then
    docker rm -f "$container" >/dev/null || true
    container=''
  fi
}
# On a non-zero exit (a failed docker port lookup, an interrupt, any set -e abort) print the container's log before it is
# removed. This trap never exits, so the script keeps its status.
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "$container" ]; then
    docker logs "$container" >&2 || true
  fi
  cleanup
}
trap on_exit EXIT
trap 'exit 130' INT TERM

# serves <role> <env...>: starts the role and waits up to 30 s for /health to answer ok.
serves() {
  local role=$1 port body=''
  shift
  container=$(docker run -d -p 127.0.0.1::8080 -e "K_SERVICE=$role" "$@" "$image")
  port=$(docker port "$container" 8080/tcp | head -n1 | cut -d: -f2)
  for _ in $(seq 30); do
    body=$(curl -fsS "http://127.0.0.1:$port/health" 2>/dev/null) && break
    sleep 1
  done
  if [ "$body" = ok ]; then
    echo "ok   $role answers /health"
  else
    fail "$role didn't answer /health with ok; its log:"
    docker logs "$container" >&2 || true
  fi
  cleanup
}

# Throwaway hash keys: web needs both to start (IP_HASH_KEY #93, EMAIL_HASH_KEY #157), the worker EMAIL_HASH_KEY (#158);
# production mounts the real ones.
# web also refuses to start without BETTER_AUTH_SECRET (#418): a random one, for this run only (#603).
auth_secret=$(openssl rand -hex 32)
serves web -e APP_ENV=production -e IP_HASH_KEY=check-image-only-ip-hash-key-0000000000 \
  -e BETTER_AUTH_SECRET="$auth_secret" -e EMAIL_HASH_KEY=check-image-only-email-hash-key-0000000
serves worker -e APP_ENV=production -e WORKER_URL=https://worker.example.test \
  -e WORKER_INVOKER_SA=skyclause-invoker@skyclause.iam.gserviceaccount.com \
  -e EMAIL_HASH_KEY=check-image-only-email-hash-key-0000000

# exits <expected stderr> <docker run arguments...>: the container exits non-zero and says why.
exits() {
  local expected=$1 output status=0
  shift
  output=$(docker run --rm "$@" 2>&1) || status=$?
  if [ "$status" -ne 0 ] && grep -q -- "$expected" <<<"$output"; then
    echo "ok   exits $status: $expected"
  else
    fail "expected a non-zero exit naming '$expected', got $status: $output"
  fi
}

# A job runs main.js with its container args (infra/ sets `job <name>`), else the job named like the Cloud Run job.
exits 'unknown job no-such-job' -e CLOUD_RUN_JOB=no-such-job -e APP_ENV=production "$image"
exits 'unknown job from-args;' -e CLOUD_RUN_JOB=other-name -e APP_ENV=production "$image" job from-args
exits 'APP_ENV=test is refused on Cloud Run' -e K_SERVICE=web -e APP_ENV=test "$image"
exits 'K_SERVICE' -e APP_ENV=production "$image"

[ "$failures" -eq 0 ] || exit 1
