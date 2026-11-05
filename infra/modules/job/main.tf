# A Cloud Run job, optionally started by Cloud Scheduler. Scheduler calls the Cloud Run Admin
# API's `:run` method, which takes an OAuth access token (Google APIs don't accept OIDC ID tokens).
# Adapter jobs retry on their next schedule, so max_retries defaults to 0.

terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
    }
  }
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name" {
  type = string
}

variable "service_account" {
  description = "Email of the service account the job runs as."
  type        = string
}

variable "env" {
  description = "Plain environment variables."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Environment variable name to Secret Manager secret ID, mounted at version latest."
  type        = map(string)
  default     = {}
}

variable "args" {
  description = "Arguments to the image's entrypoint, such as [\"job\", \"<name>\"] for apps/worker's main.js."
  type        = list(string)
  default     = []
}

variable "timeout" {
  description = "Task timeout."
  type        = string
  default     = "600s"
}

variable "max_retries" {
  type    = number
  default = 0
}

variable "schedule" {
  description = "Cron schedule; null for a job that only runs on demand."
  type        = string
  default     = null
}

variable "time_zone" {
  description = "Time zone the schedule is read in."
  type        = string
  default     = "Asia/Kuala_Lumpur"
}

variable "scheduler_service_account" {
  description = "Email of the account Scheduler starts the job as; required with a schedule."
  type        = string
  default     = null

  validation {
    condition     = var.schedule == null || var.scheduler_service_account != null
    error_message = "A scheduled job needs scheduler_service_account."
  }
}

variable "args" {
  description = "Container arguments, such as `job <name>` for the worker's job entry."
  type        = list(string)
  default     = []
}

variable "image" {
  description = "Image for the first version only; deploys replace it."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job"
}

resource "google_cloud_run_v2_job" "this" {
  project  = var.project_id
  location = var.region
  name     = var.name

  template {
    template {
      service_account = var.service_account
      timeout         = var.timeout
      max_retries     = var.max_retries

      containers {
        image = var.image
        args  = var.args

        dynamic "env" {
          for_each = var.env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = var.secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_job_iam_member" "scheduler" {
  count = var.schedule == null ? 0 : 1

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.this.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.scheduler_service_account}"
}

resource "google_cloud_scheduler_job" "this" {
  count = var.schedule == null ? 0 : 1

  project   = var.project_id
  region    = var.region
  name      = var.name
  schedule  = var.schedule
  time_zone = var.time_zone

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.this.id}:run"

    oauth_token {
      service_account_email = var.scheduler_service_account
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler]
}

output "name" {
  value = google_cloud_run_v2_job.this.name
}
