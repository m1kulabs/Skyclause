# Scheduler does not supply its actual scheduled instant; scheduled_at and lag remain null.
module "met_warning" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "adapter-met-warning"
  service_account           = local.sa.jobs
  scheduler_service_account = local.sa.invoker
  args                      = ["job", "adapter", "met_warning"]
  schedule                  = "*/10 * * * *"
  time_zone                 = "Asia/Kuala_Lumpur"
  max_retries               = 0
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "adapter-met-warning" })
  secrets                   = { for name in local.mounts.jobs : name => name }

  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}

module "met_forecast" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "adapter-met-forecast"
  service_account           = local.sa.jobs
  scheduler_service_account = local.sa.invoker
  args                      = ["job", "adapter", "met_forecast"]
  schedule                  = "0 */6 * * *"
  time_zone                 = "Asia/Kuala_Lumpur"
  max_retries               = 0
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "adapter-met-forecast" })
  secrets                   = { for name in local.mounts.jobs : name => name }

  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
