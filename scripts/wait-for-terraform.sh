#!/usr/bin/env bash
# wait-for-terraform.sh <before> <sha> (#226): a push to main that changed infra/ also runs terraform.yml, in
# parallel with deploy.yml. This waits for that run to succeed, so the deploy then sees every Cloud Run job the apply
# created. A push without an infra/ change returns at once. Needs GITHUB_REPOSITORY, GH_TOKEN (actions: read) and a
# checkout holding both commits.
set -euo pipefail

before=${1:?usage: wait-for-terraform.sh <before> <sha>}
sha=${2:?usage: wait-for-terraform.sh <before> <sha>}

# The same two-dot diff GitHub's push path filter (`infra/**`) uses to start terraform.yml. Without the base commit
# (a force-push) the diff is unknown, so wait as if infra/ changed.
if ! changed=$(git diff --name-only "$before" "$sha" -- infra/); then
  echo "::warning::Can't diff $before..$sha, so the deploy waits for a terraform run as if infra/ changed."
  changed=unknown
fi
if [ -z "$changed" ]; then
  echo "No infra/ change in this push, so the deploy doesn't wait on terraform."
  exit 0
fi

# terraform.yml's run is created with this one, so allow it about 5 minutes (20 polls) to show up.
poll=${POLL_SECONDS:-15}
id=''
for _ in $(seq 20); do
  id=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/terraform.yml/runs?head_sha=$sha&event=push" \
    --jq '.workflow_runs[0].id // empty')
  [ -n "$id" ] && break
  sleep "$poll"
done
if [ -z "$id" ]; then
  echo "::error::This push changed infra/, but no terraform run for $sha appeared, so this deploy stops."
  exit 1
fi

while :; do
  run=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$id" --jq '[.status, (.conclusion // "none"), .html_url] | @tsv')
  read -r status conclusion url <<<"$run"
  [ "$status" = completed ] && break
  echo "terraform run $url is $status; waiting."
  sleep "$poll"
done
# A frozen terraform skips its apply and still succeeds; the deploy is frozen then too.
if [ "$conclusion" != success ]; then
  # Re-running this run's jobs later could put its image back over a newer deploy; a dispatch deploys main's head.
  echo "::error::terraform run $url ended $conclusion, so this deploy stops. Once terraform succeeds, dispatch deploy."
  exit 1
fi
echo "terraform run $url succeeded."
