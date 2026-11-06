# Monitoring (#114): uptime checks and NFR-3's 99.5% SLOs with burn-rate pages, TRD's pipeline pages, a failed
# job page and the platform on-call's channels. Every policy pages the on-call channels. The budget alert is
# infra/bootstrap's, so this account needs no billing role.
# Uptime checks hit /health, which never queries the database (D45), and run within the free 1 million
# executions a month: three regions every minute is 129,600 per check.

locals {
  # One check per distinct origin: with HOST_MODE=single, app, API and MCP are all the web URL (#79 §4 Hosts).
  surfaces = { app = local.origins.app, api = local.origins.api, mcp = local.origins.mcp }
  availability = {
    for origin in distinct(values(local.surfaces)) :
    join("-", [for surface in ["app", "api", "mcp"] : surface if local.surfaces[surface] == origin]) => origin
  }

  # 2% of a 30-day budget in an hour is a burn rate of 0.02 × 720 h / 1 h = 14.4; 5% in 6 hours is 6.
  burns = {
    fast = { lookback = "3600s", rate = 14.4, about = "2% of the month's error budget in an hour" }
    slow = { lookback = "21600s", rate = 6, about = "5% of the month's error budget in 6 hours" }
  }

  # TRD's pipeline pages. The worker's `sli` handler decides each target and records `stat="breach"` once a batch,
  # so a policy reads a 0 or 1 over the last 20 minutes; `max` stays right if a batch re-runs. A policy whose
  # metric doesn't flow yet starts disabled and is switched on in one line once it has flowed for a day,
  # after checking the query in Metrics Explorer.
  pipeline = {
    polls_on_schedule = {
      title   = "An adapter missed three slots in a row"
      query   = "max by (adapter) (max_over_time({\"skyclause.polls_on_schedule\", stat=\"breach\"}[20m])) > 0"
      target  = "NFR-1: at least 99% of scheduled polls start within 60 seconds."
      waits   = "the `sli` handler in the 15-minute batch, #120's poll rows and #92's schema."
      enabled = false
    }
    reading_to_verdict = {
      title   = "Reading to shadow verdict p95 over an hour above 16 minutes"
      query   = "max(max_over_time({\"skyclause.reading_to_verdict\", stat=\"breach\"}[20m])) > 0"
      target  = "NFR-2 (relaxed in #220): reading fetched to shadow verdict within 16 minutes."
      waits   = "the `sli` handler in the 15-minute batch, the evaluator's snapshots and #92's schema."
      enabled = false
    }
    crossing_to_needs_review = {
      title   = "Crossing to needs review p95 over an hour above 3 minutes"
      query   = "max(max_over_time({\"skyclause.crossing_to_needs_review\", stat=\"breach\"}[20m])) > 0"
      target  = "NFR-2: crossing to needs review within 3 minutes (p95)."
      waits   = "the `sli` handler in the 15-minute batch, the run orchestrator's bundles and #92's schema."
      enabled = false
    }
    approver_alerted = {
      title   = "Approver alerts failed for two bundles in a row"
      query   = "max(max_over_time({\"skyclause.approver_alerted\", stat=\"breach\"}[20m])) > 0"
      target  = "NFR-2, CAL-18: approver alerts delivered within 60 seconds of needs review."
      waits   = "the `sli` handler in the 15-minute batch and `bundle_alert.accepted_at` (#92, #155)."
      enabled = false
    }
    approval_to_provider = {
      title   = "Approval to provider: under 99.9% of notices within 60 seconds over an hour"
      query   = "max(max_over_time({\"skyclause.approval_to_provider\", stat=\"breach\"}[20m])) > 0"
      target  = "NFR-3: 99.9% of approved notices handed to the provider within 60 seconds. Below 1,000 notices an hour, one slow notice breaches."
      waits   = "the `sli` handler in the 15-minute batch and `notice.accepted_at` (#92, #158)."
      enabled = false
    }
    approval_sla = {
      title   = "An approval SLA was breached with no escalation"
      query   = "max(max_over_time({\"skyclause.approval_sla\", stat=\"breach\"}[20m])) > 0"
      target  = "TRD: escalation is the alert; an unescalated breach pages."
      waits   = "the `sli` handler in the 15-minute batch and the approval and escalation rows (#92)."
      enabled = false
    }
    auditor_heartbeat = {
      title   = "The auditor heartbeat is absent for 20 minutes"
      query   = "absent_over_time({\"skyclause.heartbeat\", name=\"auditor\"}[20m])"
      target  = "TRD: the auditor runs in the 15-minute batch; no beat also means the database didn't wake."
      waits   = "#132's auditor."
      enabled = false
    }
    minute_tick_heartbeat = {
      title   = "The minute tick heartbeat is absent for 3 minutes"
      query   = "absent_over_time({\"skyclause.heartbeat\", name=\"minute_tick\"}[3m])"
      target  = "Cloud Scheduler's ticks-minute call reaches the worker every minute."
      waits   = "#90 deploying this worker, then a day of beats."
      enabled = false
    }
  }

  oncall_channel_names = [for channel in google_monitoring_notification_channel.oncall : channel.name]
}

# The address and the SLO's slo_id keep the name healthz from before #240 moved the path: renaming slo_id
# replaces the SLO, and renaming the address needs a moved block.
resource "google_monitoring_uptime_check_config" "healthz" {
  for_each = local.availability

  display_name     = "${each.key} /health"
  period           = "60s"
  timeout          = "10s"
  selected_regions = ["ASIA_PACIFIC", "EUROPE", "USA_OREGON"]

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = local.project_id
      host       = trimprefix(each.value, "https://")
    }
  }
}

resource "google_monitoring_custom_service" "availability" {
  for_each = local.availability

  service_id   = each.key
  display_name = "Availability: ${each.key}"
}

# Windows-based on the check's BOOL `check_passed`, one window a minute. Google's docs don't say how the three
# regions' results combine in a window; the SLO's console page shows it after the apply.
resource "google_monitoring_slo" "availability" {
  for_each = local.availability

  service             = google_monitoring_custom_service.availability[each.key].service_id
  slo_id              = "healthz-99-5"
  display_name        = "NFR-3: 99.5% of minutes up over 30 days"
  goal                = 0.995
  rolling_period_days = 30

  windows_based_sli {
    window_period = "60s"
    good_bad_metric_filter = join(" AND ", [
      "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\"",
      "resource.type=\"uptime_url\"",
      "metric.labels.check_id=\"${google_monitoring_uptime_check_config.healthz[each.key].uptime_check_id}\"",
    ])
  }
}

resource "google_monitoring_alert_policy" "burn" {
  for_each = {
    for pair in setproduct(keys(local.availability), keys(local.burns)) : "${pair[0]} ${pair[1]}" => {
      surface = pair[0]
      speed   = pair[1]
    }
  }

  display_name          = "Availability ${each.value.surface}: ${each.value.speed} burn"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = local.oncall_channel_names

  conditions {
    display_name = "SLO burn rate above ${local.burns[each.value.speed].rate}"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.availability[each.value.surface].name}\", \"${local.burns[each.value.speed].lookback}\")"
      comparison      = "COMPARISON_GT"
      threshold_value = local.burns[each.value.speed].rate
      duration        = "0s"
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "${local.availability[each.value.surface]}/health is failing its uptime checks: ${local.burns[each.value.speed].about} (NFR-3, 99.5% a month). Runbooks: #117."
  }
}

resource "google_monitoring_alert_policy" "job_failed" {
  display_name          = "A Cloud Run job execution failed"
  combiner              = "OR"
  severity              = "ERROR"
  notification_channels = local.oncall_channel_names

  conditions {
    display_name = "Failed executions per job"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_job\" AND metric.type = \"run.googleapis.com/job/completed_execution_count\" AND metric.labels.result = \"failed\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.job_name"]
      }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "A scheduled or deployed job (adapter-contracts, retention, restore-drill, migrate and the rest) failed. Its logs are under the job's executions in Cloud Run."
  }
}

resource "google_monitoring_alert_policy" "pipeline" {
  for_each = local.pipeline

  display_name          = each.value.title
  enabled               = each.value.enabled
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = local.oncall_channel_names

  conditions {
    display_name = each.value.title

    condition_prometheus_query_language {
      query               = each.value.query
      duration            = "0s"
      evaluation_interval = "60s"
      # The metric may not exist yet; the policy stays disabled until it has flowed for a day.
      disable_metric_validation = true
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "${each.value.target} Starts disabled; waits on ${each.value.waits}"
  }
}

# The platform on-call's contacts never enter git (#114): infra/wizards/oncall-contacts.sh stores them here as
# {"primary": {"email", "sms"}, "secondary": {"email", "sms"}}. Reading the secret puts them in this state file,
# which sits in the private state bucket. An SMS channel pages only after the wizard has verified its number.
resource "google_secret_manager_secret" "oncall_contacts" {
  secret_id = "ONCALL_CONTACTS"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

data "google_secret_manager_secret_version" "oncall_contacts" {
  count = var.oncall_contacts_ready ? 1 : 0

  secret = google_secret_manager_secret.oncall_contacts.id
}

locals {
  oncall = var.oncall_contacts_ready ? jsondecode(data.google_secret_manager_secret_version.oncall_contacts[0].secret_data) : {}
}

resource "google_monitoring_notification_channel" "oncall" {
  # Fixed keys: the contacts are sensitive, so they can't name the instances.
  for_each = var.oncall_contacts_ready ? toset(["primary email", "primary sms", "secondary email", "secondary sms"]) : toset([])

  display_name = "On-call ${each.key}"
  type         = split(" ", each.key)[1]
  labels = split(" ", each.key)[1] == "email" ? {
    email_address = local.oncall[split(" ", each.key)[0]].email
    } : {
    number = local.oncall[split(" ", each.key)[0]].sms
  }

  lifecycle {
    precondition {
      condition = (
        can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", local.oncall[split(" ", each.key)[0]].email)) &&
        can(regex("^\\+[1-9][0-9]{7,14}$", local.oncall[split(" ", each.key)[0]].sms))
      )
      error_message = "ONCALL_CONTACTS needs an email address and an E.164 phone number for primary and secondary."
    }
  }
}
