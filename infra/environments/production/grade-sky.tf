# grade-sky (#161, D26): grades each closed Sky window's calls at 23:55 MYT, with a 06:30 MYT
# catch-up for spans that close after midnight, so every window with a call by 23:59 has a grade
# by 06:45 (ANL-1). It runs as `jobs`, on DATABASE_URL_SYSTEM.
#
# Both schedules start paused: the job refuses to run until #131 (the clause engine), #133 (the
# reading history), the indicator registry and a composition root calling setGradeEngine land.

module "grade_sky" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "grade-sky"
  service_account           = local.sa.jobs
  args                      = ["job", "grade-sky"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "grade-sky" })
  secrets                   = { for name in local.mounts.jobs : name => name }
  schedule                  = "55 23 * * *"
  paused                    = true
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}

# The module takes one schedule; the catch-up starts the same job through the same `:run` call,
# as the invoker the module already grants run.invoker on it.
resource "google_cloud_scheduler_job" "grade_sky_catch_up" {
  project   = local.project_id
  region    = local.region
  name      = "grade-sky-catch-up"
  schedule  = "30 6 * * *"
  time_zone = "Asia/Kuala_Lumpur"
  # Paused with the 23:55 schedule, for the same blockers.
  paused = true

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${local.project_id}/locations/${local.region}/jobs/${module.grade_sky.name}:run"

    oauth_token {
      service_account_email = local.sa.invoker
    }
  }

  depends_on = [module.grade_sky]
}
