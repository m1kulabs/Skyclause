# Secret Manager, ID = the #79 §6 variable name, stored only in the region.

locals {
  # Generated here through write-only arguments, so no value reaches state or a plan.
  generated_secrets = ["BETTER_AUTH_SECRET", "EMAIL_HASH_KEY", "GUEST_COOKIE_SECRET", "IP_HASH_KEY"]
  # Empty containers a person fills (#118).
  human_secrets = ["GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]

  managed_secrets = concat(
    local.generated_secrets,
    local.human_secrets,
    local.database_url_secrets,
  )

  # What each unit reads (#89 ticket decision, secrets per service).
  wanted_secrets = {
    web = [
      "DATABASE_URL_APP", "DATABASE_URL_AUTH", "DATABASE_URL_SYSTEM",
      "BETTER_AUTH_SECRET", "EMAIL_HASH_KEY", "GUEST_COOKIE_SECRET", "IP_HASH_KEY",
      "GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY",
    ]
    worker   = ["DATABASE_URL_APP", "DATABASE_URL_SYSTEM", "EMAIL_HASH_KEY", "SKYCLAUSE_STAFF_EMAILS", "VAPID_PRIVATE_KEY"]
    jobs     = ["DATABASE_URL_SYSTEM", "DATABASE_URL_RETENTION"]
    migrator = ["DATABASE_URL_MIGRATE"]
  }

  # A secret with no version fails the revision, so mount only those that have one.
  ready_secrets = setunion(
    local.generated_secrets,
    local.database_url_secrets,
    var.supplied_secrets,
    var.vapid_private_key_ready ? ["VAPID_PRIVATE_KEY"] : [],
  )

  mounts = {
    for account, names in local.wanted_secrets : account => [for name in names : name if contains(local.ready_secrets, name)]
  }
}

resource "google_secret_manager_secret" "this" {
  for_each = toset(local.managed_secrets)

  secret_id = each.key

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

ephemeral "random_password" "generated" {
  for_each = toset(local.generated_secrets)

  length  = 64
  special = false
}

resource "google_secret_manager_secret_version" "generated" {
  for_each = toset(local.generated_secrets)

  secret                 = google_secret_manager_secret.this[each.key].id
  secret_data_wo         = ephemeral.random_password.generated[each.key].result
  secret_data_wo_version = 1
}

# Accessor grants for every mount; VAPID_PRIVATE_KEY is #113's secret, so it's named, not managed.
resource "google_secret_manager_secret_iam_member" "access" {
  for_each = merge([
    for account, names in local.mounts : { for name in names : "${name} ${account}" => { secret = name, account = account } }
  ]...)

  secret_id = try(google_secret_manager_secret.this[each.value.secret].secret_id, each.value.secret)
  role      = "roles/secretmanager.secretAccessor"
  member    = local.member[each.value.account]
}
