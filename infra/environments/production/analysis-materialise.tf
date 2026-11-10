# analysis-materialise (#162, TRD grading): rewrites every project's analysis figures from `grade`
# and the call and evidence times at 00:30 MYT, after the 23:55 Sky grading, and again at 06:40
# MYT, after the 06:30 catch-up. It runs as `jobs`, on DATABASE_URL_SYSTEM.
#
# Unlike the graders it needs nothing unbuilt, so its schedules start running: with no grades yet
# it writes n = 0 figures. Twice a day keeps within D45's 15-minute wake spacing.

module "analysis_materialise" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "analysis-materialise"
  service_account           = local.sa.jobs
  args                      = ["job", "analysis-materialise"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "analysis-materialise" })
  secrets                   = { for name in local.mounts.jobs : name => name }
  schedule                  = "30 0 * * *"
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}

# The module takes one schedule; the 06:40 run starts the same job through the same `:run` call,
# as the invoker the module already grants run.invoker on it.
resource "google_cloud_scheduler_job" "analysis_materialise_catch_up" {
  project   = local.project_id
  region    = local.region
  name      = "analysis-materialise-catch-up"
  schedule  = "40 6 * * *"
  time_zone = "Asia/Kuala_Lumpur"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${local.project_id}/locations/${local.region}/jobs/${module.analysis_materialise.name}:run"

    oauth_token {
      service_account_email = local.sa.invoker
    }
  }

  depends_on = [module.analysis_materialise]
}
