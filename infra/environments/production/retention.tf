# retention (#112, NFR-14): the nightly sweep at 03:30 MYT, on DATABASE_URL_RETENTION. It sweeps subscribers 30 days
# past unsubscribe (through #110's erasure), camera frames past the semester end or 183 days, expired export files,
# `idempotency_key` rows, expired `rate_limit` windows, `domain_event` rows published more than 30 days ago with their
# `handled_event` marks, and `handled_message` marks older than one day, logging one line per sweeper per organisation.
#
# The schedule starts paused: the subscriber sweep calls #110's `eraseSubscriber`, which has not merged, so every run
# would fail on it. Unpause when #110 lands. The `retention` login's grants already cover every swept table
# (migrations 0002 and 0004), and `jobs` holds roles/storage.objectUser on the frames and exports buckets
# (storage.tf), which this job lists and deletes under `orgs/{org_id}/`.
#
# D9: a failing sweeper is logged and the run goes on; the job exits non-zero at the end.

module "retention" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "retention"
  service_account           = local.sa.jobs
  args                      = ["job", "retention"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "retention" })
  secrets                   = { for name in local.mounts.jobs : name => name }
  schedule                  = "30 3 * * *"
  paused                    = true
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database
  ]
}
