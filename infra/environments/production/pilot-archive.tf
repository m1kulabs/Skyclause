# pilot-archive (#146, LED-8): after 17 November a pilot team member uploads the Sheets ledger,
# the Jira register and the run traces to the archive bucket's incoming/, with `kind` and
# `captured-at` metadata, and runs this once by hand (#79 §9 item 11). It copies each file
# under orgs/{org_id}/pilot/ and records it for PILOT_PROJECT, which d-commons sets through
# app_config.
#
# The grants it and the reads need already exist: `jobs` (this job) and `web` hold
# roles/storage.objectUser on the archive bucket (storage.tf), and `web` signs the 15-minute
# download URLs keylessly through its own serviceAccountTokenCreator grant (main.tf).

module "pilot_archive" {
  source = "../../modules/job"

  project_id      = local.project_id
  region          = local.region
  name            = "pilot-archive"
  service_account = local.sa.jobs
  args            = ["job", "pilot-archive"]
  env             = merge(local.env, { OTEL_SERVICE_NAME = "pilot-archive" })
  secrets         = { for name in local.mounts.jobs : name => name }

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
