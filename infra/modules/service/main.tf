# A Cloud Run service. Terraform sets its identity, environment and secrets; #90 deploys the
# image, so the image and the fields gcloud writes on deploy are ignored after creation.

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
  description = "Email of the service account the service runs as."
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

variable "public" {
  description = "Grant roles/run.invoker to allUsers."
  type        = bool
  default     = false
}

variable "timeout" {
  description = "Request timeout."
  type        = string
  default     = "300s"
}

variable "image" {
  description = "Image for the first revision only; deploys replace it."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

resource "google_cloud_run_v2_service" "this" {
  project  = var.project_id
  location = var.region
  name     = var.name
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account
    timeout         = var.timeout

    containers {
      image = var.image

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

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      traffic,
      template[0].revision,
      template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.public ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "name" {
  value = google_cloud_run_v2_service.this.name
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}
