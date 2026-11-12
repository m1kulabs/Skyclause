# Pilot

The P0 pilot is one Apps Script project, `skyclause-pilot`, owned by the pilot owner, plus the camera page, the Pi agent and the TypeScript they share. Only `main` deploys to it: through CI, or by the pilot owner's hand while GitHub Actions is down. Each developer works in their own Apps Script project with their own dev workbook.

Contents:

1.  [Layout](#layout)
1.  [Set up your dev project](#set-up-your-dev-project)
1.  [Work in dev](#work-in-dev)
1.  [How the pilot deploys](#how-the-pilot-deploys)
1.  [Deploy by hand while Actions is down](#deploy-by-hand-while-actions-is-down)
1.  [Secrets and variables](#secrets-and-variables)
1.  [Set up or repair the pilot](#set-up-or-repair-the-pilot)

## Layout

- `apps-script/`: the Apps Script project. `src/` holds the logic and the thin entry points; `build.ts` bundles them into `dist/` for clasp, which doesn't transpile TypeScript.
- `camera/`: the camera page (#60), synced to the public bucket `skyclause-camera`.
- `pi/`: the Pi device agent (#72).
- `shared/`: TypeScript used by more than one runtime.
- `workflows/`: one Markdown spec per Gemini Enterprise workflow.
- `fixtures/`: real captures for tests; see the [fixtures README](/pilot/fixtures/README.md).
- `wizard.sh`: the pilot owner's setup wizard.
- `deploy.sh`: the pilot owner's deploy while GitHub Actions is down.

## Set up your dev project

This takes about 10 minutes, once.

1.  Turn on the Google Apps Script API in your [Apps Script settings](https://script.google.com/home/usersettings) (about 2 minutes).
1.  Log in to clasp as yourself: `bunx @google/clasp@3.4.1 login`.
1.  Create your own script in an empty folder, so clasp's starter files land there, and note the script ID it prints:

    ```bash
    cd "$(mktemp -d)" && bunx @google/clasp@3.4.1 create-script --type standalone --title "skyclause-dev-$USER"
    ```

1.  Write `pilot/apps-script/.clasp.json` with your script ID. Git ignores it.

    ```json
    { "scriptId": "<your script ID>", "rootDir": "dist" }
    ```

1.  Build and push from the repo root:

    ```bash
    bun pilot/apps-script/build.ts && (cd pilot/apps-script && bunx @google/clasp@3.4.1 push --force)
    ```

1.  Open your script with `bunx @google/clasp@3.4.1 open-script` from `pilot/apps-script/`, choose `setup` in the function list and run it. It asks you to grant the manifest's scopes, then makes your dev workbook and Drive folders: 26 tabs with header rows only, and no triggers, because a local build carries no pilot script ID.

## Work in dev

- Rebuild and push after each change with the command above. Never put the pilot's script ID in your `.clasp.json` and never push to it: only CI and the pilot owner's `deploy.sh` push there.
- Run functions by hand in the editor. Dev has no triggers, so nothing runs on a schedule. Poll each feed no more often than its cadence: JPS every 5 minutes, MET warnings every 10, APIMS every 15 and the MET forecast every 6 hours.
- Test the web app at your head deployment's `/dev` URL (Deploy, then Test deployments). It runs your latest push and needs you signed in. `/exec` URLs serve versioned deployments.
- Before a PR, run `bun run lint`, `bun test` and `bun run typecheck`.

## How the pilot deploys

- `pilot-ci` runs on every pull request, with jobs `lint`, `pr-title`, `test`, `build` and `secrets` (gitleaks over the full history). The pre-commit hook also runs gitleaks on staged changes, so install it first (`brew install gitleaks`).
- `pilot-deploy` runs on a push to `main` that touches `pilot/apps-script/`, `pilot/shared/`, `pilot/camera/` or `bun.lock`. It re-runs the checks, pushes to the pilot with the owner's `CLASPRC_JSON`, points the web app deployment at a new version described by the commit SHA, and waits for `?health=1` to report that SHA. It also syncs the camera build to the bucket through workload identity federation, with no key.
- Until the wizard has run, each deploy job is skipped with a notice naming the secret or variable it's missing, and the canary reports that the pilot isn't set up yet.
- `DEPLOY_FREEZE=true` skips deploys, P1's included. Set it with `gh variable set DEPLOY_FREEZE --body true -R m1kulabs/Skyclause`; a dispatch with `override_freeze` deploys the pilot anyway.
- Triggers run pushed code at once, so the scope guard stops any deploy whose `oauthScopes` differ from the deployed manifest's. To ship a scope change, dispatch `pilot-deploy` with `scopes_reauthorized`, then the pilot owner runs `setup()` in the editor straight away to grant the new scopes.
- `pilot-canary` runs at 00:30 MYT. It fails if Google rejects the owner's token, if health fails, or if a source outside `off_hours` is past its `stale_after_min` or has never had a successful poll.
- Each deploy adds a script version, and a project can have up to 200. When it gets close, delete versions that no deployment uses, as the [versions guide](https://developers.google.com/apps-script/guides/versions) describes.

## Deploy by hand while Actions is down

While GitHub Actions can't start jobs, a merge to `main` doesn't reach the pilot. The pilot owner deploys it from the checkout the wizard ran in:

```bash
git switch main && git pull --ff-only && bash pilot/deploy.sh
```

- It runs `pilot-deploy`'s checks and Apps Script steps in their order and with the same commands: install, lint, type-check, `bun test`, build, the scope guard, `clasp push --force`, then `update-deployment` on `INGEST_DEPLOYMENT_ID`, so `INGEST_URL` doesn't change, and a wait until `?health=1` reports the SHA. `pilot/deploy.test.ts` fails when the workflow's steps change and the script doesn't follow.
- It refuses local changes (untracked records in `pilot/workflows/` excepted), any commit but the tip of `origin/main`, `DEPLOY_FREEZE=true` and a pilot the wizard hasn't set up. It reads `PILOT_SCRIPT_ID`, `INGEST_DEPLOYMENT_ID` and `INGEST_URL` from the repo variables, and `PILOT_OWNER_EMAIL` from `.env`.
- GitHub never hands `CLASPRC_JSON` back, so clasp signs in afresh: choose the pilot owner in the browser. The token stays in a temporary `HOME` that's deleted on exit, and is never printed. Any other account is refused, because the web app runs as whoever updates its deployment.
- To ship a scope change, run `SCOPES_REAUTHORIZED=true bash pilot/deploy.sh`, then run `setup()` in the editor straight away.
- It ends with the deployed SHA and the health JSON: paste them where a deploy's run ID is asked for. A re-run is safe and adds one more script version.
- It doesn't deploy the camera page. That job signs in to Google through workload identity federation with the OIDC token GitHub issues to a run on `main`, and nothing outside Actions has one, so the camera page waits for Actions.
- Once Actions runs again, deploy through `pilot-deploy` only: the script isn't part of its `deploy-pilot` concurrency group.

## Secrets and variables

| Name                                                    | Kind      | Set by                                                                                     |
| ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `CLASPRC_JSON`                                          | Secret    | Wizard stage 3, the only deploy credential                                                 |
| `PILOT_SCRIPT_ID`, `INGEST_DEPLOYMENT_ID`, `INGEST_URL` | Variables | Wizard stage 4                                                                             |
| `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `CAMERA_BUCKET`   | Variables | Wizard stage 7                                                                             |
| `DEPLOY_FREEZE`                                         | Variable  | By hand: `false` since setup; #78 sets `true` after submission; P1's workflows read it too |

`PI_TOKEN` joins them when #68 adds its fallback runner.

## Set up or repair the pilot

The pilot owner runs `bash pilot/wizard.sh` from a clean, up-to-date `main` checkout; the first run takes about 40 minutes. It needs `gh` signed in with admin rights on the repo, `gcloud` signed in as an owner of the `skyclause` project, and `bun`, `jq`, `curl` and `openssl`. It detects finished stages and skips them, so re-run it to mint a new `CLASPRC_JSON` after a revocation or a red canary. It keeps the owner's IDs and the device tokens in the repo-root `.env`, which Git ignores, and shares it with the Gemini Enterprise wizard (#49), so the owner's address, the alert emails and the conditions calendar carry over.
