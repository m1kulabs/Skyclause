# Neon Postgres 18 in AWS Singapore, on the Free plan: 100 CU-hours a month, after which the
# compute stays suspended until the month ends. The compute sleeps after 5 idle minutes (fixed
# on Free); the tick and timers never touch the database, so it can (BRIEF, 6 Nov 2026).

locals {
  database = "skyclause"

  # DATABASE_URL_* suffix to its login (#91: logins are named after their roles). `migrator`
  # is the project's default role and owns the database.
  database_logins = {
    APP       = "app"
    AUTH      = "auth_app"
    SYSTEM    = "system"
    RETENTION = "retention"
    MIGRATE   = "migrator"
  }
  database_url_secrets = [for suffix in keys(local.database_logins) : "DATABASE_URL_${suffix}"]
  app_logins           = toset([for login in values(local.database_logins) : login if login != "migrator"])
}

resource "neon_project" "main" {
  name = local.prefix
  # The key's only organisation ("dev", Free plan); Neon's API needs it to create projects.
  org_id     = "org-super-glitter-92783185"
  region_id  = "aws-ap-southeast-1"
  pg_version = 18

  # Point-in-time restore window: 6 hours is Free's maximum, and Free has no scheduled snapshots.
  history_retention_seconds = 21600

  branch {
    name          = "main"
    database_name = local.database
    role_name     = "migrator"
  }

  # A fixed size keeps CU-hours equal to awake hours times this size.
  primary_compute {
    autoscaling_limit_min_cu = var.neon_compute_cu
    autoscaling_limit_max_cu = var.neon_compute_cu
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Neon gives every role made through its API membership of neon_superuser, which can
# SET ROLE to it and bypass RLS. So only `migrator` comes from Neon; it creates the other
# logins in SQL, where they get no such membership and #91 grants them their roles.
resource "random_password" "login" {
  for_each = local.app_logins

  length  = 40
  special = false
}

resource "postgresql_role" "login" {
  for_each = local.app_logins

  name     = each.key
  login    = true
  password = random_password.login[each.key].result
}

# Direct (unpooled) host: Neon's pooler runs PgBouncer in transaction mode, which drops
# LISTEN/NOTIFY (#79 §5) and session advisory locks.
resource "google_secret_manager_secret_version" "database" {
  for_each = local.database_logins

  secret = google_secret_manager_secret.this["DATABASE_URL_${each.key}"].id
  secret_data = format(
    "postgresql://%s:%s@%s/%s?sslmode=verify-full",
    each.value,
    urlencode(each.value == "migrator" ? neon_project.main.database_password : random_password.login[each.value].result),
    neon_project.main.database_host,
    local.database,
  )
}
