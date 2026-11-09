# grade-crowd (#161, ANL-3): grades each listed Crowd night on D+1 once the Rapid Rail file covers
# it, and records unlisted surges. Hourly, so a night is graded within the hour of the file
# landing; D45 lets nothing scheduled wake the database more than every 15 minutes. It runs as
# `jobs`, on DATABASE_URL_SYSTEM.

module "grade_crowd" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "grade-crowd"
  service_account           = local.sa.jobs
  args                      = ["job", "grade-crowd"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "grade-crowd" })
  secrets                   = { for name in local.mounts.jobs : name => name }
  schedule                  = "0 * * * *"
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
