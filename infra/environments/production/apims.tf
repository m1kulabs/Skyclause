# Scheduler does not supply its actual scheduled instant; scheduled_at and lag remain null.
module "apims" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "adapter-apims"
  service_account           = local.sa.jobs
  scheduler_service_account = local.sa.invoker
  args                      = ["job", "adapter", "apims"]
  schedule                  = "*/15 * * * *"
  time_zone                 = "Asia/Kuala_Lumpur"
  max_retries               = 0
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "adapter-apims" })
  secrets                   = { for name in local.mounts.jobs : name => name }

  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
