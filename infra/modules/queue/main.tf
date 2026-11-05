# A Cloud Tasks queue. Enqueuers put the invoker's OIDC token on each task, so they also need
# roles/iam.serviceAccountUser on the invoker account (granted by the caller).

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

variable "enqueuers" {
  description = "Who may create tasks: a static label to an IAM member, so for_each plans before the member exists."
  type        = map(string)
  default     = {}
}

resource "google_cloud_tasks_queue" "this" {
  project  = var.project_id
  location = var.region
  name     = var.name
}

resource "google_cloud_tasks_queue_iam_member" "enqueuer" {
  for_each = var.enqueuers

  project  = var.project_id
  location = var.region
  name     = google_cloud_tasks_queue.this.name
  role     = "roles/cloudtasks.enqueuer"
  member   = each.value
}

output "name" {
  value = google_cloud_tasks_queue.this.name
}
