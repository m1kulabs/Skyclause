#!/usr/bin/env bash
#
# Deploys main to skyclause-pilot from your machine while GitHub Actions can't run (#572): pilot-deploy.yml's checks
# and apps-script jobs, step for step. Run `bash pilot/deploy.sh` from a clean, up-to-date main checkout, the one
# pilot/wizard.sh ran in. Paths are from the repo root.

set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""
fi

say()  { printf '\n%s%s▸ %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

REPO=m1kulabs/Skyclause
# The pilot's own project file, named apart from the .clasp.json each developer keeps for their dev script.
CLASP_PROJECT=pilot/apps-script/.clasp-pilot.json

BUN_CACHE="${BUN_INSTALL_CACHE_DIR:-$HOME/.bun/install/cache}"

# pclasp runs clasp as the pilot owner: the login lives under a temporary HOME, deleted on exit, so your
# ~/.clasprc.json is never read or overwritten and no token outlives the run.
pclasp() { HOME="$DEPLOY_TMP/home" BUN_INSTALL_CACHE_DIR="$BUN_CACHE" bunx @google/clasp@3.4.1 "$@"; }

# gh_var NAME prints a repository variable, or nothing if it's unset; a failed call fails, so it's never "unset".
gh_var() { gh variable list -R "$REPO" --json name,value --jq ".[] | select(.name == \"$1\") | .value"; }

lower() { tr '[:upper:]' '[:lower:]' <<<"$1"; }

# clean stops the run on local changes, except the setup records the owner keeps untracked in pilot/workflows/.
clean() {
  [[ -z "$(git status --porcelain -- . ':(exclude)pilot/workflows')" ]] && return
  warn "commit or stash your local changes first: the build stamps HEAD's SHA on what it deploys"
  exit 1
}

run_deploy() {

cd "$(dirname "${BASH_SOURCE[0]}")/.."
DEPLOY_TMP=$(mktemp -d)
trap 'rm -rf "$DEPLOY_TMP" "$CLASP_PROJECT"' EXIT

for tool in git gh bun jq; do
  command -v "$tool" >/dev/null 2>&1 || { warn "install $tool first, then re-run"; exit 1; }
done
gh auth status >/dev/null 2>&1 || { warn "run gh auth login first, then re-run"; exit 1; }

git fetch -q origin main
clean
# Only the tip, as a push to main deploys: an older commit would roll the pilot back.
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  warn "check out the tip of origin/main (git switch main && git pull --ff-only), then re-run"
  exit 1
fi

# DEPLOY_FREEZE is shared with P1's workflows and #78 owns it, so this script only reads it. GitHub compares strings
# case-insensitively, so the workflow's condition freezes on TRUE as well. Plain assignments, so set -e stops on a
# failed gh call instead of reading it as unset.
freeze=$(gh_var DEPLOY_FREEZE)
if [[ "$(lower "$freeze")" == true ]]; then
  warn "DEPLOY_FREEZE is true (#78): the pilot doesn't deploy until it's lifted"
  exit 1
fi
# As the workflow's job env: build.ts stamps PILOT_SCRIPT_ID, deployed.ts reads INGEST_URL.
PILOT_SCRIPT_ID=$(gh_var PILOT_SCRIPT_ID)
INGEST_DEPLOYMENT_ID=$(gh_var INGEST_DEPLOYMENT_ID)
INGEST_URL=$(gh_var INGEST_URL)
missing=()
for name in PILOT_SCRIPT_ID INGEST_DEPLOYMENT_ID INGEST_URL; do
  [[ -n "${!name}" ]] || missing+=("$name")
done
if (( ${#missing[@]} )); then
  warn "GitHub doesn't hold ${missing[*]}: run pilot/wizard.sh first"
  exit 1
fi
export PILOT_SCRIPT_ID INGEST_DEPLOYMENT_ID INGEST_URL
# The wizard's stage 1 keeps the owner's address in the repo-root .env, which Git ignores.
owner=$(grep -E '^PILOT_OWNER_EMAIL=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d "'\"" || true)
if [[ -z "$owner" ]]; then
  warn ".env has no PILOT_OWNER_EMAIL: run this from the checkout pilot/wizard.sh ran in"
  exit 1
fi
# As on a runner: build.ts stamps GITHUB_SHA, so a stale one in your shell can't reach the bundle.
export GITHUB_SHA
GITHUB_SHA=$(git rev-parse HEAD)

say "Checks, as pilot-deploy's checks job"
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit -p pilot
bun test
bun pilot/apps-script/build.ts
clean

say "Scope guard"
# SCOPES_REAUTHORIZED=true stands in for the dispatch input scopes_reauthorized.
if [[ "${SCOPES_REAUTHORIZED:-}" == true ]]; then
  warn "skipping the scope guard: run setup() in the Apps Script editor straight after this deploy"
elif ! bun pilot/apps-script/deployed.ts scope-guard; then
  warn "to ship a scope change: SCOPES_REAUTHORIZED=true bash pilot/deploy.sh, then the owner runs setup() at once"
  exit 1
fi

say "Sign in to clasp as $owner"
note "In the browser, choose $owner and allow every scope clasp asks for."
mkdir -p "$DEPLOY_TMP/home"
pclasp login
login_email=$(pclasp --json show-authorized-user | jq -r '.email // empty')
if [[ "$(lower "$login_email")" != "$(lower "$owner")" ]]; then
  # The web app runs as whoever updates the deployment (USER_DEPLOYING), so only the owner may.
  warn "signed in as ${login_email:-an unknown user}, not $owner; re-run and choose the owner"
  exit 1
fi

say "Push and point the web app deployment at the new version"
printf '{"scriptId":"%s","rootDir":"dist"}\n' "$PILOT_SCRIPT_ID" > "$CLASP_PROJECT"
pclasp -P "$CLASP_PROJECT" push --force
pclasp -P "$CLASP_PROJECT" update-deployment "$INGEST_DEPLOYMENT_ID" -d "$GITHUB_SHA"

say "Wait for health to report $GITHUB_SHA"
health=$(bun pilot/apps-script/deployed.ts await-sha "$GITHUB_SHA")

printf '\n%s%s  ✓ Deployed %s to skyclause-pilot%s\n' "$BOLD" "$GREEN" "$GITHUB_SHA" "$RESET"
printf '%s\n' "$health"
note "With Actions down, this SHA and health JSON are the deploy's evidence in place of a run ID."

}

run_deploy "$@"; exit
