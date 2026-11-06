# Rollback runbook

How to put the previous release back by moving Cloud Run traffic, and when a migration means you must fix forward instead. Rollback is by revision traffic, migrations stay compatible one release back and jobs pin image digests ([TRD environments and deployment](/docs/TRD.md#environments-and-deployment)).

Contents:

1.  [When to roll back](#when-to-roll-back)
1.  [When a migration forbids rolling back](#when-a-migration-forbids-rolling-back)
1.  [Roll back a service](#roll-back-a-service)
1.  [Roll back a job](#roll-back-a-job)
1.  [Roll forward again](#roll-forward-again)
1.  [Rollback dry runs](#rollback-dry-runs)
1.  [See also](#see-also)

## When to roll back

Roll back when a release broke something users see and the release before it didn't. Restore service first and find the cause afterwards. Set `DEPLOY_FREEZE` first, so the next merge doesn't deploy the broken code again ([incident runbook](incident.md#error-budgets-and-deploy_freeze)).

Every service and job runs the same image, so a rollback normally covers `web`, `worker` and the jobs together.

## When a migration forbids rolling back

Rolling back moves code, never the schema: migrations are expand and contract, so the schema a release leaves behind still works for the release before it, and no further. So:

- Roll back one release only, to the revision just before the broken one.
- Don't roll back past a release whose migration contracted something older code still uses: a dropped or renamed column, table or type, or a tightened constraint. Check what changed in `packages/db` between the two releases' commits with `git log --oneline <previous-sha>..<broken-sha> -- packages/db`.
- Never execute `migrate` from an older image.
- If the migration itself damaged data, rolling back can't undo it: restore the database to the moment before it ran ([restore runbook](restore.md)), within Neon's 6-hour window.

When rolling back is forbidden, fix forward: keep `DEPLOY_FREEZE` set, merge the fix and ship it as the incident runbook describes.

## Roll back a service

For `web`, then `worker`. Each deploy run's summary prints, under "Rollback", the traffic before that deploy with the exact command that moves it back, and each job's image before it. Or list the revisions, newest first, with the image each runs:

```shell
gcloud run revisions list --service=web --region=asia-southeast1 --project=skyclause \
  --format='table(metadata.name,metadata.creationTimestamp,status.imageDigest)'
```

Send all traffic to the revision before the broken one, then check where traffic goes:

```shell
gcloud run services update-traffic web --to-revisions=<previous-revision>=100 \
  --region=asia-southeast1 --project=skyclause
gcloud run services describe web --region=asia-southeast1 --project=skyclause --format='value(status.traffic)'
```

Repeat both with `--service=worker` and `worker`. Traffic stays on that revision until the next deploy, which moves it to its own new revision, so keep `DEPLOY_FREEZE` set until the deploy that carries the fix.

## Roll back a job

Jobs have no traffic: each execution runs the job's current image. Pin each job, except `migrate`, to the previous release's digest, which is the image of the `web` revision you rolled back to:

```shell
gcloud run revisions describe <previous-revision> --region=asia-southeast1 --project=skyclause \
  --format='value(status.imageDigest)'
gcloud run jobs list --region=asia-southeast1 --project=skyclause
gcloud run jobs update <job> --image=<digest> --region=asia-southeast1 --project=skyclause
```

An execution already running keeps the image it started with.

## Roll forward again

The fix's deploy moves `web` and `worker` to its new revisions and puts its digest on every job, so nothing is left pinned. To give the latest revisions their traffic back without a deploy, for example after a false alarm:

```shell
gcloud run services update-traffic web --to-latest --region=asia-southeast1 --project=skyclause
gcloud run services update-traffic worker --to-latest --region=asia-southeast1 --project=skyclause
```

Clear `DEPLOY_FREEZE` if nothing else holds it.

## Rollback dry runs

A dry run moves `web`'s traffic to the previous revision and back to latest, with the commands above, and records the result here.

| Date (MYT)             | Run by                    | Service | Moved to        | Moved back to           | Result                                                                                                |
| ---------------------- | ------------------------- | ------- | --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-11-06 08:31–08:33 | The #90 agent, for kymil4 | `web`   | `web-00004-2jl` | Latest, `web-00005-dxl` | `GET /health` 200 after each move; commands and output in [#90's evidence comment][rollback evidence] |

[rollback evidence]: https://github.com/m1kulabs/Skyclause/issues/90#issuecomment-6673305288

## See also

- [Incident runbook](incident.md)
- [Restore runbook](restore.md)
- [Cloud Run: roll back, gradual rollouts and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
