# A Pub/Sub topic stored only in the region, with one push subscription to the worker that
# carries an OIDC token. The worker checks the token's audience and email (§4 Worker).

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

variable "push_endpoint" {
  type = string
}

variable "push_service_account" {
  description = "Email of the account whose OIDC token the push carries."
  type        = string
}

variable "audience" {
  description = "OIDC audience; the worker accepts its own base URL."
  type        = string
}

variable "publishers" {
  description = "Who may publish: a static label to an IAM member, so for_each plans before the member exists."
  type        = map(string)
  default     = {}
}

resource "google_pubsub_topic" "this" {
  project = var.project_id
  name    = var.name

  message_storage_policy {
    allowed_persistence_regions = [var.region]
  }
}

resource "google_pubsub_subscription" "push" {
  project = var.project_id
  name    = "${var.name}-worker"
  topic   = google_pubsub_topic.this.id
  # The most Pub/Sub allows, so a slow handler (a model call) isn't redelivered mid-run.
  ack_deadline_seconds = 600

  push_config {
    push_endpoint = var.push_endpoint

    oidc_token {
      service_account_email = var.push_service_account
      audience              = var.audience
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  # Never delete the subscription for inactivity (the default is after 31 days).
  expiration_policy {
    ttl = ""
  }
}

resource "google_pubsub_topic_iam_member" "publisher" {
  for_each = var.publishers

  project = var.project_id
  topic   = google_pubsub_topic.this.name
  role    = "roles/pubsub.publisher"
  member  = each.value
}

output "name" {
  value = google_pubsub_topic.this.name
}
