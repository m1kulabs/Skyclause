# Run once by a `skyclause` project owner, before CI can apply `environments/production`
# (infra/README.md). It adopts the state bucket, enables the APIs the environment uses and
# creates the `terraform` service account that CI impersonates through P0's WIF provider.

terraform {
  required_version = "~> 1.17"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.10"
    }
  }

  backend "gcs" {
    bucket = "skyclause-production-tfstate"
    prefix = "bootstrap"
  }
}

locals {
  project_id = "skyclause"
  region     = "asia-southeast1"

  # P0's pool and provider (#48), never edited here (D10). GitHub issues this repository
  # immutable subjects, so this one principal is `main` of m1kulabs/Skyclause and nothing else.
  main_branch_principal = "principal://iam.googleapis.com/projects/413187272599/locations/global/workloadIdentityPools/github/subject/repo:m1kulabs@351977595/Skyclause@1444328887:ref:refs/heads/main"

  apis = [
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
    "telemetry.googleapis.com",
  ]

  # Admin per service it manages, plus the IAM it needs to grant roles and mint the eval pool.
  terraform_roles = [
    "roles/artifactregistry.admin",
    "roles/cloudkms.admin",
    "roles/cloudscheduler.admin",
    "roles/cloudtasks.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/iam.workloadIdentityPoolAdmin",
    "roles/monitoring.editor",
    "roles/pubsub.admin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/storage.admin",
  ]
}

provider "google" {
  project = local.project_id
  region  = local.region
}

# The Budget API needs a quota project with user credentials, which the owner applies this with.
provider "google" {
  alias                 = "billing"
  project               = local.project_id
  region                = local.region
  user_project_override = true
  billing_project       = local.project_id
}

resource "google_project_service" "this" {
  for_each = toset(local.apis)

  service = each.value
  # P0 uses some of these too; destroying this config must never turn them off.
  disable_on_destroy = false
}

# The owner creates the bucket with gcloud first (infra/README.md), since it holds this state.
import {
  to = google_storage_bucket.state
  id = "skyclause-production-tfstate"
}

resource "google_storage_bucket" "state" {
  name                        = "skyclause-production-tfstate"
  location                    = "ASIA-SOUTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "terraform" {
  account_id   = "skyclause-terraform"
  display_name = "terraform"
  description  = "Applies infra/environments/production from main (#89)."

  depends_on = [google_project_service.this]
}

resource "google_project_iam_member" "terraform" {
  for_each = toset(local.terraform_roles)

  project = local.project_id
  role    = each.value
  member  = google_service_account.terraform.member
}

resource "google_service_account_iam_member" "terraform_wif" {
  service_account_id = google_service_account.terraform.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.main_branch_principal
}

# Neon's API key for the production apply. The owner adds its value (infra/README.md); CI reads
# it after WIF, so GitHub holds no credential (#79 §6).
resource "google_secret_manager_secret" "neon_api_key" {
  secret_id = "NEON_API_KEY"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_iam_member" "terraform_neon" {
  secret_id = google_secret_manager_secret.neon_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.terraform.member
}

output "terraform_service_account" {
  value = google_service_account.terraform.email
}

# The budget alert (#114, #79 §9 gate 2). Budgets live on the billing account, which also pays for the owner's
# other projects, so the owner applies it here and the CI account holds no billing role. With no update rule,
# alerts email the billing account's administrators and users.
resource "google_billing_budget" "monthly" {
  provider = google.billing

  billing_account = "01D106-4ADF3E-8FE685"
  display_name    = "skyclause monthly"

  # This project only.
  budget_filter {
    projects        = ["projects/413187272599"]
    calendar_period = "MONTH"
  }

  # Gate 2's US$10 in the account's currency, the only one the Budget API takes: RM40.46 at Bank Negara
  # Malaysia's noon middle rate on 5 November 2026 (4.046), rounded down.
  amount {
    specified_amount {
      currency_code = "MYR"
      units         = "40"
    }
  }

  # Gate 2's thresholds, on actual spend.
  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }

  depends_on = [google_project_service.this]
}
