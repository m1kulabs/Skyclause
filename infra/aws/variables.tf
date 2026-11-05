variable "google_service_account_ids" {
  description = "Numeric unique IDs of #89's web and worker service accounts, the sub and azp of their Google ID tokens."
  type = object({
    web    = string
    worker = string
  })

  validation {
    condition     = alltrue([for id in values(var.google_service_account_ids) : can(regex("^[0-9]+$", id))])
    error_message = "Each ID is the account's numeric uniqueId, not its email."
  }
}
