# restore-drill (#117): each quarter, branch the database 10 minutes back, time it, walk every
# ledger and delete the branch (docs/runbooks/restore.md). The job runs as its own account, which
# reads only its own Neon key and DATABASE_URL_SYSTEM (#224).

resource "google_service_account" "drill" {
  account_id   = "skyclause-drill"
  display_name = "drill"
  description  = "The restore-drill job (#117)"
}

# Deploying a job version that runs as the account needs actAs on it (#90).
resource "google_service_account_iam_member" "drill_deployer" {
  service_account_id = google_service_account.drill.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.member.deployer
}

# The job's entry point exports telemetry like every other job's (#114).
resource "google_project_iam_member" "drill_telemetry" {
  for_each = toset(["roles/telemetry.writer", "roles/serviceusage.serviceUsageConsumer"])

  project = local.project_id
  role    = each.key
  member  = google_service_account.drill.member
}

# Scoped to this project: it can't create projects, mint keys or read another project. Neon can't
# narrow a key to branch names, so the job itself refuses every branch not named drill-*.
resource "neon_org_api_key" "drill" {
  name       = "${local.prefix}-restore-drill"
  org_id     = neon_project.main.org_id
  project_id = neon_project.main.id
}

resource "google_secret_manager_secret" "neon_drill_api_key" {
  secret_id = "NEON_DRILL_API_KEY"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "neon_drill_api_key" {
  secret      = google_secret_manager_secret.neon_drill_api_key.id
  secret_data = neon_org_api_key.drill.key
}

resource "google_secret_manager_secret_iam_member" "neon_drill_api_key" {
  secret_id = google_secret_manager_secret.neon_drill_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.drill.member
}

# The ledger walk and the newest-write reads, as `system` on the branch (the same URL with the
# branch's host) and on production (#224).
resource "google_secret_manager_secret_iam_member" "drill_database_url_system" {
  secret_id = google_secret_manager_secret.this["DATABASE_URL_SYSTEM"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.drill.member
}

module "restore_drill" {
  source = "../../modules/job"

  project_id      = local.project_id
  region          = local.region
  name            = "restore-drill"
  service_account = google_service_account.drill.email
  args            = ["job", "restore-drill"]
  env             = merge(local.env, { OTEL_SERVICE_NAME = "restore-drill", NEON_PROJECT_ID = neon_project.main.id })
  secrets = {
    NEON_DRILL_API_KEY  = google_secret_manager_secret.neon_drill_api_key.secret_id
    DATABASE_URL_SYSTEM = google_secret_manager_secret.this["DATABASE_URL_SYSTEM"].secret_id
  }
  # The drill gives up at 4 hours, the RTO; the rest leaves time to delete the branch.
  timeout = "15300s"
  # 10:00 MYT on the first day of each quarter.
  schedule                  = "0 10 1 1,4,7,10 *"
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.neon_drill_api_key,
    google_secret_manager_secret_version.neon_drill_api_key,
    google_secret_manager_secret_iam_member.drill_database_url_system,
    google_secret_manager_secret_version.database,
  ]
}
