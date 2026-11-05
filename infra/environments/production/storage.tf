# Buckets (#89 ticket decision; NFR-14). Objects sit under orgs/{org_id}/ (#79 §3).

locals {
  buckets = {
    exports = { versioned = false, rules = [{ age = 7 }] }
    frames = {
      versioned = true
      rules = [
        # The uploader sets customTime to the project's semester_ends_on.
        { days_since_custom_time = 0 },
        # NFR-14's ceiling, which also catches frames with no custom time.
        { age = 183 },
        # Deleted versions leave within NFR-14's 35 days.
        { days_since_noncurrent_time = 30 },
      ]
    }
    archive = { versioned = true, rules = [] }
    scratch = { versioned = false, rules = [{ age = 1 }] }
    sources = { versioned = false, rules = [] }
  }
}

resource "google_storage_bucket" "this" {
  for_each = local.buckets

  name                        = "${local.prefix}-${each.key}"
  location                    = "ASIA-SOUTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = each.value.versioned
  }

  dynamic "lifecycle_rule" {
    for_each = each.value.rules
    content {
      action {
        type = "Delete"
      }
      condition {
        age                                 = try(lifecycle_rule.value.age, null)
        days_since_custom_time              = try(lifecycle_rule.value.days_since_custom_time, null)
        send_days_since_custom_time_if_zero = can(lifecycle_rule.value.days_since_custom_time) ? true : null
        days_since_noncurrent_time          = try(lifecycle_rule.value.days_since_noncurrent_time, null)
      }
    }
  }
}

resource "google_storage_bucket_iam_member" "this" {
  for_each = {
    for pair in setproduct(keys(local.buckets), ["web", "worker", "jobs"]) : "${pair[0]} ${pair[1]}" => {
      bucket  = pair[0]
      account = pair[1]
    }
  }

  bucket = google_storage_bucket.this[each.value.bucket].name
  role   = "roles/storage.objectUser"
  member = local.member[each.value.account]
}
