# retention (#112, NFR-14): the nightly sweep at 03:30 MYT, on DATABASE_URL_RETENTION. It sweeps subscribers 30 days
# past unsubscribe (through #110's erasure), camera frames past the semester end or 183 days, expired export files,
# `idempotency_key` rows, expired `rate_limit` windows, `domain_event` rows published more than 30 days ago with their
# `handled_event` marks, and `handled_message` marks older than one day, logging one line per sweeper per organisation.
#
# The schedule runs. The subscriber sweep erases through #110's `eraseSubscriber`, which has merged. The erasure runs
# on the `system` login inside withTenant, so `system` needs its grants on subscriber, subscriber_token, suppression
# and audit_event (migration 0004). The sweeps run on the `retention` login, whose grants cover every swept table
# (migrations 0002 and 0004). `jobs` holds roles/storage.objectUser on the frames and exports buckets (storage.tf),
# which this job lists and deletes under `orgs/{org_id}/`.
#
# D9: a failing sweeper is logged and the run goes on; the job exits non-zero at the end.
#
# It also mounts EMAIL_HASH_KEY (#551), which eraseSubscriber hashes addresses with, through the jobs account's grant
# (secrets.tf). Of the jobs, only kms-rewrap also mounts it, through local.mounts.worker; the web and worker services do too.

module "retention" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "retention"
  service_account           = local.sa.jobs
  args                      = ["job", "retention"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "retention" })
  secrets                   = merge({ for name in local.mounts.jobs : name => name }, { EMAIL_HASH_KEY = "EMAIL_HASH_KEY" })
  schedule                  = "30 3 * * *"
  paused                    = false
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_iam_member.retention_hash_key,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database
  ]
}
