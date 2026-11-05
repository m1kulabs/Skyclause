variable "app_env" {
  description = "APP_ENV on every service and job."
  type        = string
  default     = "production"

  validation {
    # The one live environment; `test` is for CI only and `dev` for laptops (#79 §6, §7).
    condition     = var.app_env == "production"
    error_message = "app_env must be production."
  }
}

variable "host_mode" {
  description = "HOST_MODE: single serves every surface from one origin until the domain exists (#79 §4 Hosts)."
  type        = string
  default     = "single"

  validation {
    condition     = contains(["single", "multi"], var.host_mode)
    error_message = "host_mode must be single or multi."
  }

  validation {
    condition     = var.host_mode == "single" || var.origins != null
    error_message = "host_mode multi needs origins."
  }
}

variable "origins" {
  description = "The six *_ORIGIN values; null sets each to the web service's URL."
  type = object({
    marketing = string
    app       = string
    api       = string
    mcp       = string
    embed     = string
    docs      = string
  })
  default = null
}

variable "app_config" {
  description = "Values other tickets make (#79 §6 TF rows), set on every service and job only when given."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([for name in keys(var.app_config) : contains([
      "ADAPTER_USER_AGENT",
      "AWS_ROLE_ARN",
      "COMMONS_MODEL_TOKENS_PER_DAY",
      "EMAIL_FROM_AUTH",
      "EMAIL_FROM_NOTICES",
      "GOOGLE_CLIENT_ID",
      "GUEST_ACTIVE_WINDOWS",
      "GUEST_EVIDENCE_PER_DAY",
      "GUEST_RUNS_PER_DAY",
      "INBOUND_BUCKET",
      "INBOUND_DOMAIN",
      "INBOUND_SNS_TOPIC_ARN",
      "PILOT_PROJECT",
      "REVIEWER_EVIDENCE_PER_DAY",
      "REVIEWER_WINDOWS_PER_DAY",
      "SES_CONFIGURATION_SET",
      "SES_EVENTS_SNS_TOPIC_ARN",
      "SES_REGION",
      "TURNSTILE_SITE_KEY",
      "VAPID_PUBLIC_KEY",
    ], name)])
    error_message = "app_config takes only the #79 §6 names other tickets supply."
  }
}

variable "supplied_secrets" {
  description = "Human-supplied secrets that now hold a version. Cloud Run fails a revision whose secret has none, so each is mounted only once listed here."
  type        = set(string)
  default     = []

  validation {
    condition     = alltrue([for name in var.supplied_secrets : contains(["GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"], name)])
    error_message = "supplied_secrets takes GOOGLE_CLIENT_SECRET, SKYCLAUSE_STAFF_EMAILS or TURNSTILE_SECRET_KEY."
  }
}

variable "vapid_private_key_ready" {
  description = "Mount VAPID_PRIVATE_KEY on the worker once #113's vapid-keys job has created it."
  type        = bool
  default     = false
}

variable "log_level" {
  type    = string
  default = "info"
}

variable "neon_compute_cu" {
  description = "Fixed size of the Neon compute in compute units (0.25 CU is 1 GB of memory)."
  type        = number
  default     = 0.25
}

variable "map_domains" {
  description = "Map the hosts under skyclause.m1ku.tech to web. Turn on only after Search Console lists skyclause-terraform as a verified owner of skyclause.m1ku.tech."
  type        = bool
  default     = false
}
