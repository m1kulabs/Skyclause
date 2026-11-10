# Source execution writes immutable GCS objects; only the 15-minute worker batch
# pulls results into Postgres (D45). Adapter-specific schedules belong to #121–#128.
module "source_daily_job" {
  source   = "../../modules/job"
  for_each = { catalogue-sync = "10 1 * * *", adapter-contracts = "40 1 * * *" }

  project_id                = local.project_id
  region                    = local.region
  name                      = each.key
  service_account           = local.sa.jobs
  scheduler_service_account = local.sa.invoker
  args                      = ["job", each.key]
  schedule                  = each.value
  env                       = merge(local.env, { OTEL_SERVICE_NAME = each.key })
  secrets                   = { for name in local.mounts.jobs : name => name }

  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
