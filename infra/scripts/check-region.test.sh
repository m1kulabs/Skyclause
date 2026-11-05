#!/usr/bin/env bash
# Runs check-region over testdata/ and asserts its exit code and the addresses it names.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
check="$here/check-region"
failures=0

# expect <fixture> <exit code> [text the output must contain]...
expect() {
  local fixture="$1" want="$2" got output
  shift 2
  set +e
  output="$("$check" "$here/testdata/$fixture" 2>&1)"
  got=$?
  set -e
  if [[ "$got" != "$want" ]]; then
    echo "FAIL $fixture: exit $got, want $want"
    echo "$output"
    failures=$((failures + 1))
    return
  fi
  local text
  for text in "$@"; do
    if [[ "$output" != *"$text"* ]]; then
      echo "FAIL $fixture: output lacks '$text'"
      echo "$output"
      failures=$((failures + 1))
      return
    fi
  done
  echo "ok   $fixture"
}

expect plan-in-region.json 0
expect plan-bucket-in-us.json 1 'google_storage_bucket.this["frames"]: location = US'
expect plan-global-by-default.json 1 'google_secret_manager_secret.this["BETTER_AUTH_SECRET"]: replication is not pinned' 'module.topic["runs-requested"].google_pubsub_topic.this: message storage is not pinned'
expect state-neon-elsewhere.json 1 'neon_project.main: region_id = aws-us-east-1'

if ((failures > 0)); then
  echo "$failures failed"
  exit 1
fi
