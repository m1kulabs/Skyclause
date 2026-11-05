# Cloud Run services and jobs, with the #79 §6 TF values set and secrets mounted. #90 deploys
# the image; adapter tickets add one `module "job"` block each below `migrate`.

locals {
  # TF rows of #79 §6; app_config never overrides them.
  env = merge(var.app_config, {
    APP_ENV           = var.app_env
    HOST_MODE         = var.host_mode
    MARKETING_ORIGIN  = local.origins.marketing
    APP_ORIGIN        = local.origins.app
    API_ORIGIN        = local.origins.api
    MCP_ORIGIN        = local.origins.mcp
    EMBED_ORIGIN      = local.origins.embed
    DOCS_ORIGIN       = local.origins.docs
    VAPID_SUBJECT     = local.origins.app
    GCP_PROJECT       = local.project_id
    GCP_REGION        = local.region
    WORKER_URL        = local.worker_url
    WORKER_INVOKER_SA = local.sa.invoker
    EXPORTS_BUCKET    = google_storage_bucket.this["exports"].name
    FRAMES_BUCKET     = google_storage_bucket.this["frames"].name
    ARCHIVE_BUCKET    = google_storage_bucket.this["archive"].name
    SCRATCH_BUCKET    = google_storage_bucket.this["scratch"].name
    SOURCES_BUCKET    = google_storage_bucket.this["sources"].name
    KMS_AI_KEYS_KEY   = google_kms_crypto_key.this["ai-keys"].id
    KMS_WEBHOOK_KEY   = google_kms_crypto_key.this["webhook"].id
    VERTEX_LOCATION   = "global"
    LOG_LEVEL         = var.log_level
  })
}

module "web" {
  source = "../../modules/service"

  project_id      = local.project_id
  region          = local.region
  name            = "web"
  service_account = local.sa.web
  env             = merge(local.env, { OTEL_SERVICE_NAME = "web" })
  secrets         = { for name in local.mounts.web : name => name }
  public          = true
  # SSE streams close after 5 minutes (#79 §5).
  timeout = "600s"

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}

# The worker admits unauthenticated calls at the invoker binding; server.ts checks Google OIDC
# (audience WORKER_URL, email WORKER_INVOKER_SA) except on /ses/* (#79 §4 Worker).
module "worker" {
  source = "../../modules/service"

  project_id      = local.project_id
  region          = local.region
  name            = "worker"
  service_account = local.sa.worker
  env             = merge(local.env, { OTEL_SERVICE_NAME = "worker" })
  secrets         = { for name in local.mounts.worker : name => name }
  public          = true
  # Matches the push subscriptions' 600 s acknowledgement deadline.
  timeout = "600s"

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}

module "migrate" {
  source = "../../modules/job"

  project_id      = local.project_id
  region          = local.region
  name            = "migrate"
  service_account = local.sa.migrator
  env             = merge(local.env, { OTEL_SERVICE_NAME = "migrate" })
  secrets         = { for name in local.mounts.migrator : name => name }

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}

# #113's vapid-keys job makes the approver web-push pair once (infra/README.md). Terraform holds
# only the empty secret; the job adds its one version, which the worker mounts once
# vapid_private_key_ready is true. The job may list and add versions but never read them.
resource "google_secret_manager_secret" "vapid_private_key" {
  secret_id = "VAPID_PRIVATE_KEY"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "vapid_keys" {
  for_each = toset(["roles/secretmanager.viewer", "roles/secretmanager.secretVersionAdder"])

  secret_id = google_secret_manager_secret.vapid_private_key.secret_id
  role      = each.key
  member    = local.member.jobs
}

module "vapid_keys" {
  source = "../../modules/job"

  project_id      = local.project_id
  region          = local.region
  name            = "vapid-keys"
  service_account = local.sa.jobs
  env             = merge(local.env, { OTEL_SERVICE_NAME = "vapid-keys" })

  depends_on = [google_secret_manager_secret_iam_member.vapid_keys]
}

# Custom hosts (#79 §4 Hosts) through Cloud Run domain mappings, all on `web`. Each host's DNS
# records come out as `dns_records`, for Cloudflare.
resource "google_cloud_run_domain_mapping" "this" {
  for_each = var.map_domains ? toset([
    "skyclause.m1ku.tech",
    "app.skyclause.m1ku.tech",
    "api.skyclause.m1ku.tech",
    "mcp.skyclause.m1ku.tech",
    "embed.skyclause.m1ku.tech",
    "docs.skyclause.m1ku.tech",
  ]) : toset([])

  location = local.region
  name     = each.key

  metadata {
    namespace = local.project_id
  }

  spec {
    route_name = module.web.name
  }
}
