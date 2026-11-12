# Restore runbook

How to put production's database back to a moment before it was damaged, and the quarterly drill that proves the restore works. On Neon's Free plan a restore reaches only the last 6 hours (D45 in #79); the longer targets were relaxed on 6 November 2026 and [#220] tracks restoring them.

Contents:

1.  [Restore window](#restore-window)
1.  [Restore the database](#restore-the-database)
1.  [Restore drill](#restore-drill)
    1.  [What the drill records](#what-the-drill-records)
    1.  [Why RPO compares with production](#why-rpo-compares-with-production)
    1.  [What the drill may touch](#what-the-drill-may-touch)
    1.  [Run the drill](#run-the-drill)
    1.  [Read the drill result](#read-the-drill-result)
1.  [Drill log](#drill-log)
1.  [See also](#see-also)

## Restore window

- Neon Free's instant restore reaches any point in the last 6 hours (`history_retention_seconds = 21600`, up to 1 GB of change history) and takes seconds. There are no scheduled snapshots, and the one manual snapshot Free allows is never taken, so deleted data never outlives the window; the drill fails if a snapshot exists ([TRD environments and deployment](/docs/TRD.md#environments-and-deployment)).
- Damage found more than 6 hours after it happened can't be restored from Neon.
- The `frames` and `archive` buckets are versioned: restore an object from its noncurrent version.

## Restore the database

The Neon project is `billowing-glade-35477031` (`terraform output neon_project_id`).

1.  Pick the point: the last moment before the damage, in UTC, from the incident timeline, the audit log or Cloud Logging. Check now that it is less than 6 hours ago; the window keeps moving.
1.  Set `DEPLOY_FREEZE` ([incident runbook](incident.md#error-budgets-and-deploy_freeze)), so no deploy or migration runs during the restore.
1.  Restore the default branch, `main`, to the point in place. Neon moves `main`'s compute to the restored branch, so every `DATABASE_URL_*` keeps working; connections drop briefly, and writes after the point are replaced, though the backup branch still holds them. The restored `main` gets a new branch ID, so look it up each time:

    ```shell
    export NEON_API_KEY="$(gcloud secrets versions access latest --secret=NEON_API_KEY --project=skyclause)"
    API=https://console.neon.tech/api/v2/projects/billowing-glade-35477031
    MAIN="$(curl -sS "$API/branches" -H "Authorization: Bearer $NEON_API_KEY" | jq -r '.branches[] | select(.default) | .id')"
    curl -sS -X POST "$API/branches/$MAIN/restore" \
      -H "Authorization: Bearer $NEON_API_KEY" -H 'Content-Type: application/json' \
      -d "{\"source_branch_id\": \"$MAIN\", \"source_timestamp\": \"<point>\", \"preserve_under_name\": \"main-before-restore\"}"
    ```

1.  Check the restored data: walk each affected project's ledger (`GET /v1/projects/{id}/ledger/verify`, #146) and look at the rows the damage touched.
1.  Delete the `main-before-restore` branch once the restore is checked, or once anything still needed from it is copied: it holds the damaged or deleted data, which must not outlive the window (NFR-14). Its ID is in `curl -sS "$API/branches" -H "Authorization: Bearer $NEON_API_KEY"`.
1.  Before the next Terraform apply, check that `terraform plan` shows no change to `neon_project.main`.
1.  Write each step and its time in MYT into the incident timeline, and clear `DEPLOY_FREEZE` if nothing else holds it.

Neon documents the restore call and its backup branch in [instant restore](https://neon.com/docs/introduction/branch-restore).

## Restore drill

The `restore-drill` job (`apps/worker/src/restore-drill/`) runs at 10:00 MYT on 1 January, April, July and October. It:

1.  Reads back the project's restore window and its snapshot count.
1.  Deletes any `drill-*` branch an earlier run left behind.
1.  Branches `main` at a point 10 minutes back, as `drill-<point>`, and times the branch's compute until Neon reports it `active` ("running and accepting connections").
1.  Walks every project's ledger on the branch as `system` and compares the branch's newest write with production's.
1.  Deletes the branch, also when a step fails or Cloud Run stops the job.
1.  Logs one line and exits non-zero on any miss.

### What the drill records

| Field                 | Meaning                                                                                      | A miss when                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `point`               | The restore point, 10 minutes before the run, UTC                                            | The window doesn't reach it (the drill stops first) |
| `branch`              | `drill-<point>`                                                                              |                                                     |
| `window_s`            | `history_retention_seconds`, read back from Neon                                             |                                                     |
| `snapshots`           | Snapshots in the project                                                                     | Any: deleted data would outlive the window          |
| `ready_s`             | Branch request to the compute reporting `active`                                             |                                                     |
| `verified_s`          | The ledger walk and the branch's newest-write read                                           |                                                     |
| `rto_ok`              | `ready_s + verified_s` within 4 hours                                                        | False                                               |
| `rpo_s`               | How far the branch's newest write trails production's newest write at or before the point    | Over 300 s, or null                                 |
| `lag_s`               | The point minus the branch's newest write                                                    | Never; see below                                    |
| `projects`, `entries` | Projects walked and ledger entries verified                                                  |                                                     |
| `first_bad`           | The first broken entry: `project`, `id`, `seq` and `reason` (`seq_gap`, `prev_hash`, `hash`) | Any                                                 |
| `deleted`             | The branch was deleted                                                                       | False                                               |
| `swept`               | `drill-*` branches from earlier runs deleted first                                           |                                                     |

The drill still checks the ticket's RPO 5 minutes and RTO 4 hours, which Neon meets with a restore of seconds. The TRD no longer promises them on the Free plan ([#220]).

### Why RPO compares with production

On the Free plan the worker writes in 15-minute batches and the database sleeps when idle, so the newest row before any point can be up to 15 minutes old, or hours old at night, with nothing lost. Measured against the point alone, as `lag_s` is, most drills would fail. `rpo_s` measures what the branch is missing instead: production's newest write at or before the point minus the branch's, 0 when the branch holds everything production had.

A write here is a `domain_event` or `analytics_event` row: the database stamps both with `now()`, the start of the writing transaction on its own clock, which is the clock Neon branches by. Neon cuts at commit time, so a transaction that starts before the point and commits after it counts on production but isn't on the branch, and `rpo_s` comes out too high. Run the drill again before treating an RPO miss as lost data.

### What the drill may touch

The job runs as `skyclause-drill`, which reads only the `NEON_DRILL_API_KEY` and `DATABASE_URL_SYSTEM` secrets. It connects as `system` to production and to the branch, with the same URL and the branch's host, since a branch keeps its parent's logins and passwords. Its connections are read-only (`default_transaction_read_only`), though the `system` login may write what the workers write. The branch's connection closes before the branch is deleted, except when SIGTERM stops the drill mid-walk: the branch is then deleted under the open connection, and the deletion still goes through. The Neon key is scoped to this one project: it can't create projects, mint keys or read another project, but Neon can't narrow it further, so it could change anything inside the project. The job's Neon client refuses to create or delete any branch not named `drill-*`, and Neon refuses to delete the default branch.

### Run the drill

From a machine signed in to `skyclause`:

```shell
gcloud run jobs execute restore-drill --region=asia-southeast1 --project=skyclause --wait
```

### Read the drill result

```shell
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="restore-drill" AND jsonPayload.message:"restore drill"' \
  --project=skyclause --limit=1 --format=json
```

A pass logs `restore drill` at INFO with the record. A miss logs `restore drill missed` at ERROR with the record and a `misses` list, and the execution fails. If the ledger walk or a read throws, the drill still deletes the branch, but the execution fails with that error as `worker failed` and records no row, so the read above finds nothing for it. If `deleted` is false, or the execution was killed, delete the leftover `drill-*` branch now: it is a full copy of production's personal data. The next run would sweep it, but not for 3 months.

## Drill log

Whoever runs a drill, or is on call when the scheduled one runs, adds a row by pull request. Times are MYT; `point` is UTC.

| Date (MYT)       | Run by                                                                                | `point`              | `ready_s` | `verified_s` | `rto_ok` | `rpo_s` | `projects` | `entries` | `first_bad` | `window_s` | `snapshots` | `deleted` | Notes                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------- | --------- | ------------ | -------- | ------- | ---------- | --------- | ----------- | ---------- | ----------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 07:07 | An agent for kymil4, from a laptop (#117)                                             | 2026-11-05T22:57:59Z | 3.7       | 0            | true     | null    | 0          | 0         | null        | 21600      | 0           | true      | First drill, before the job's first apply, with the owner's Neon key. The database has no schema yet (#91) and the ledger walk isn't built (#146), so `entries` is 0 and RPO wasn't measured |
| 2026-11-06 08:35 | An agent for kymil4, with `gcloud run jobs execute` (execution `restore-drill-xfntw`) | 2026-11-06T00:25:31Z | 3.6       | 0            | true     | null    | 0          | 0         | null        | 21600      | 0           | true      | First run on Cloud Run, as `skyclause-drill` with the project-scoped `NEON_DRILL_API_KEY`. `entries` is 0 and RPO unmeasured until #224                                                      |

## See also

- [Incident runbook](incident.md)
- [Rollback runbook](rollback.md)
- [Neon: branching from a point in time](https://neon.com/docs/manage/branches)

[#220]: https://github.com/m1kulabs/Skyclause/issues/220
