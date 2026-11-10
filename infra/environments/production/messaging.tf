# Pub/Sub topics, Cloud Tasks queues, the minute tick and the 15-minute batch (#79 §5, D45). Every
# call to the worker carries an OIDC token for the invoker account with audience WORKER_URL.

module "topic" {
  source   = "../../modules/topic"
  for_each = toset(["domain-events", "readings-updated", "runs-requested"])

  project_id           = local.project_id
  region               = local.region
  name                 = each.key
  push_endpoint        = "${local.worker_url}/pubsub/${each.key}"
  push_service_account = local.sa.invoker
  audience             = local.worker_url
  publishers = {
    web    = local.member.web
    worker = local.member.worker
    jobs   = local.member.jobs
  }
}

module "queue" {
  source   = "../../modules/queue"
  for_each = toset(["bundle-timers", "webhook-deliveries", "shift-reminders", "exports"])

  project_id = local.project_id
  region     = local.region
  name       = each.key
  enqueuers = {
    web    = local.member.web
    worker = local.member.worker
  }
}

resource "google_cloud_scheduler_job" "ticks_minute" {
  name      = "ticks-minute"
  region    = local.region
  schedule  = "* * * * *"
  time_zone = "Etc/UTC"

  http_target {
    http_method = "POST"
    uri         = "${local.worker_url}/ticks/minute"

    oidc_token {
      service_account_email = local.sa.invoker
      audience              = local.worker_url
    }
  }
}

resource "google_cloud_scheduler_job" "ticks_batch" {
  name      = "ticks-batch"
  region    = local.region
  schedule  = "*/15 * * * *"
  time_zone = "Etc/UTC"

  http_target {
    http_method = "POST"
    uri         = "${local.worker_url}/ticks/batch"

    oidc_token {
      service_account_email = local.sa.invoker
      audience              = local.worker_url
    }
  }
}

# Pull-only durable source results. No push endpoint may wake Postgres per poll.
resource "google_pubsub_topic" "poll_results" {
  project = local.project_id
  name    = "poll-results"

  message_storage_policy {
    allowed_persistence_regions = [local.region]
  }
}

resource "google_pubsub_subscription" "poll_results" {
  project                    = local.project_id
  name                       = "poll-results-worker"
  topic                      = google_pubsub_topic.poll_results.id
  ack_deadline_seconds       = 600
  message_retention_duration = "604800s"

  expiration_policy {
    ttl = ""
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_pubsub_topic_iam_member" "poll_results_publisher" {
  for_each = { worker = local.member.worker, jobs = local.member.jobs }

  project = local.project_id
  topic   = google_pubsub_topic.poll_results.name
  role    = "roles/pubsub.publisher"
  member  = each.value
}

resource "google_pubsub_subscription_iam_member" "poll_results_subscriber" {
  project      = local.project_id
  subscription = google_pubsub_subscription.poll_results.name
  role         = "roles/pubsub.subscriber"
  member       = local.member.worker
}
