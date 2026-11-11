# Cloud Run services and jobs, with the #79 §6 TF values set and secrets mounted. #90 deploys
# the image; adapter tickets add one `module "job"` block each below `migrate`.

locals {
  # The plain mail values: committed in app_config, delivered by group and only to a service (secrets.tf, "Mail"), never to a job.
  sending_values   = ["EMAIL_FROM_AUTH", "EMAIL_FROM_NOTICES"]
  receiving_values = ["INBOUND_DOMAIN"]
  sending_env      = local.mail_ready ? { for name, value in var.app_config : name => value if contains(local.sending_values, name) } : {}
  receiving_env    = local.mail_ready ? { for name, value in var.app_config : name => value if contains(local.receiving_values, name) } : {}

  shared_config = { for name, value in var.app_config : name => value if !contains(concat(local.sending_values, local.receiving_values), name) }

  # TF rows of #79 §6; app_config never overrides them.
  env = merge(local.shared_config, {
    APP_ENV                     = var.app_env
    HOST_MODE                   = var.host_mode
    MARKETING_ORIGIN            = local.origins.marketing
    APP_ORIGIN                  = local.origins.app
    API_ORIGIN                  = local.origins.api
    MCP_ORIGIN                  = local.origins.mcp
    EMBED_ORIGIN                = local.origins.embed
    DOCS_ORIGIN                 = local.origins.docs
    VAPID_SUBJECT               = local.origins.app
    GCP_PROJECT                 = local.project_id
    GCP_REGION                  = local.region
    WORKER_URL                  = local.worker_url
    WORKER_INVOKER_SA           = local.sa.invoker
    EXPORTS_BUCKET              = google_storage_bucket.this["exports"].name
    FRAMES_BUCKET               = google_storage_bucket.this["frames"].name
    ARCHIVE_BUCKET              = google_storage_bucket.this["archive"].name
    SCRATCH_BUCKET              = google_storage_bucket.this["scratch"].name
    SOURCE_RESULTS_SUBSCRIPTION = google_pubsub_subscription.poll_results.name
    SOURCES_BUCKET              = google_storage_bucket.this["sources"].name
    KMS_AI_KEYS_KEY             = google_kms_crypto_key.this["ai-keys"].id
    KMS_WEBHOOK_KEY             = google_kms_crypto_key.this["webhook"].id
    VERTEX_LOCATION             = "global"
    LOG_LEVEL                   = var.log_level
  })

  web_env    = merge(local.env, local.sending_env)
  worker_env = merge(local.env, local.sending_env, local.receiving_env)
}

module "web" {
  source = "../../modules/service"

  project_id      = local.project_id
  region          = local.region
  name            = "web"
  service_account = local.sa.web
  env             = merge(local.web_env, { OTEL_SERVICE_NAME = "web" })
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
# (audience WORKER_URL, email WORKER_INVOKER_SA) except on /resend/webhook, which Resend calls from the
# internet and which checks its own Svix signature (#653).
module "worker" {
  source = "../../modules/service"

  project_id      = local.project_id
  region          = local.region
  name            = "worker"
  service_account = local.sa.worker
  env             = merge(local.worker_env, { OTEL_SERVICE_NAME = "worker" })
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
# vapid_private_key_ready is true. Only the job's own account may list and add versions, and it
# can't read them.
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
  member    = local.member.vapid
}

module "vapid_keys" {
  source = "../../modules/job"

  project_id      = local.project_id
  region          = local.region
  name            = "vapid-keys"
  service_account = local.sa.vapid
  args            = ["job", "vapid-keys"]
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
