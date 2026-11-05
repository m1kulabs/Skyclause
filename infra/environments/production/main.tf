# Every Google Cloud resource P1 needs, in the `skyclause` project beside P0 (D10: no P0
# resource is managed or changed here). APIs, the state bucket and the terraform account are
# infra/bootstrap's.

data "google_project" "this" {
  project_id = local.project_id
}

locals {
  project_id = "skyclause"
  region     = "asia-southeast1"
  prefix     = "skyclause-${var.app_env}"

  # Cloud Run's deterministic URLs, so services can name each other without a dependency cycle.
  web_url    = "https://web-${data.google_project.this.number}.${local.region}.run.app"
  worker_url = "https://worker-${data.google_project.this.number}.${local.region}.run.app"

  origins = var.origins != null ? var.origins : {
    marketing = local.web_url
    app       = local.web_url
    api       = local.web_url
    mcp       = local.web_url
    embed     = local.web_url
    docs      = local.web_url
  }

  # Same principal as infra/bootstrap's: `main` of m1kulabs/Skyclause through P0's provider.
  main_branch_principal = "principal://iam.googleapis.com/projects/413187272599/locations/global/workloadIdentityPools/github/subject/repo:m1kulabs@351977595/Skyclause@1444328887:ref:refs/heads/main"
}

# Service accounts. IDs need 6 to 30 characters, hence the prefix.

locals {
  accounts = {
    web      = "Cloud Run service web"
    worker   = "Cloud Run service worker"
    jobs     = "Adapter and batch jobs"
    migrator = "The migrate job"
    invoker  = "OIDC identity on Pub/Sub, Scheduler and Cloud Tasks calls to the worker (WORKER_INVOKER_SA)"
    deployer = "Deploys images from main (#90)"
    vapid    = "The vapid-keys job, the only account that may add VAPID_PRIVATE_KEY versions (#113)"
  }

  sa     = { for name, account in google_service_account.this : name => account.email }
  member = { for name, account in google_service_account.this : name => account.member }

  project_roles = concat(
    # Telemetry goes to Google's OTLP endpoint (#114), which needs the writer role and the quota project.
    flatten([for account in ["web", "worker", "jobs", "migrator"] : [
      { account = account, role = "roles/telemetry.writer" },
      { account = account, role = "roles/serviceusage.serviceUsageConsumer" },
    ]]),
    [
      { account = "worker", role = "roles/aiplatform.user" },
      { account = "deployer", role = "roles/run.developer" },
    ],
  )

  # Account-on-account grants: who may act as whom.
  account_roles = [
    # Enqueuers put the invoker's OIDC token on Cloud Tasks.
    { account = "invoker", member = "web", role = "roles/iam.serviceAccountUser" },
    { account = "invoker", member = "worker", role = "roles/iam.serviceAccountUser" },
    # Keyless V4 signed URLs for export files sign through the account itself.
    { account = "web", member = "web", role = "roles/iam.serviceAccountTokenCreator" },
    { account = "worker", member = "worker", role = "roles/iam.serviceAccountTokenCreator" },
    # Deploying a revision that runs as an account needs actAs on it.
    { account = "web", member = "deployer", role = "roles/iam.serviceAccountUser" },
    { account = "worker", member = "deployer", role = "roles/iam.serviceAccountUser" },
    { account = "jobs", member = "deployer", role = "roles/iam.serviceAccountUser" },
    { account = "migrator", member = "deployer", role = "roles/iam.serviceAccountUser" },
    { account = "vapid", member = "deployer", role = "roles/iam.serviceAccountUser" },
  ]
}

resource "google_service_account" "this" {
  for_each = local.accounts

  account_id   = "skyclause-${each.key}"
  display_name = each.key
  description  = each.value
}

resource "google_project_iam_member" "this" {
  for_each = { for grant in local.project_roles : "${grant.account} ${grant.role}" => grant }

  project = local.project_id
  role    = each.value.role
  member  = local.member[each.value.account]
}

resource "google_service_account_iam_member" "this" {
  for_each = { for grant in local.account_roles : "${grant.member} ${grant.role} on ${grant.account}" => grant }

  service_account_id = google_service_account.this[each.value.account].name
  role               = each.value.role
  member             = local.member[each.value.member]
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.this["deployer"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.main_branch_principal
}

# Artifact Registry

resource "google_artifact_registry_repository" "skyclause" {
  location      = local.region
  repository_id = "skyclause"
  format        = "DOCKER"
}

resource "google_artifact_registry_repository_iam_member" "deployer" {
  location   = local.region
  repository = google_artifact_registry_repository.skyclause.name
  role       = "roles/artifactregistry.writer"
  member     = local.member.deployer
}
