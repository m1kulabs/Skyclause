# a-data-rights: once per day, remove every row and object after the 30-day organisation deletion grace period.
module "org_purge" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "org-purge"
  service_account           = local.sa.jobs
  args                      = ["job", "org:purge"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "org-purge" })
  secrets                   = { for name in local.mounts.jobs : name => name }
  schedule                  = "0 3 * * *"
  time_zone                 = "Asia/Kuala_Lumpur"
  scheduler_service_account = local.sa.invoker

  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
