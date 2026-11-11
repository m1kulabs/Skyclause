# Which mail settings reach which unit (#653), planned offline with mocked providers:
# `terraform -chdir=infra/environments/production init -backend=false`, then `terraform -chdir=infra/environments/production test`.
# A service has all of a mail group's settings or none, so the plain values follow the secrets: with none supplied mail is off
# everywhere, valid for the old image and the new one. No job ever takes a mail setting or a mail secret.

mock_provider "google" {}
mock_provider "neon" {}
mock_provider "postgresql" {}
mock_provider "random" {}

variables {
  app_config = {
    EMAIL_FROM_AUTH    = "Skyclause <sign-in@notices.skyclause.m1ku.tech>"
    EMAIL_FROM_NOTICES = "Skyclause <notices@notices.skyclause.m1ku.tech>"
    INBOUND_DOMAIN     = "in.skyclause.m1ku.tech"
    GOOGLE_CLIENT_ID   = "client-id"
  }
}

run "no_resend_secret_supplied_means_mail_is_off_everywhere" {
  command = plan

  variables {
    supplied_secrets = ["GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]
  }

  assert {
    condition = alltrue([
      for env in [local.env, local.web_env, local.worker_env] : length(setintersection(keys(env), ["EMAIL_FROM_AUTH", "EMAIL_FROM_NOTICES", "INBOUND_DOMAIN"])) == 0
    ])
    error_message = "With no Resend secret supplied, no unit gets a mail variable."
  }

  assert {
    condition     = alltrue([for env in [local.env, local.web_env, local.worker_env] : env.GOOGLE_CLIENT_ID == "client-id"])
    error_message = "The rest of app_config still reaches every unit."
  }

  assert {
    condition = alltrue([
      for mounted in [local.mounts.web, local.mounts.worker, local.mounts.jobs, local.worker_job_mounts] : length(setintersection(mounted, local.mail_secrets)) == 0
    ])
    error_message = "With no Resend secret supplied, no unit mounts a mail secret."
  }
}

run "all_three_supplied_turns_mail_on_for_the_services_only" {
  command = plan

  variables {
    supplied_secrets = ["GOOGLE_CLIENT_SECRET", "RESEND_RECEIVING_API_KEY", "RESEND_SENDING_API_KEY", "RESEND_WEBHOOK_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]
  }

  assert {
    condition     = local.web_env.EMAIL_FROM_AUTH == var.app_config.EMAIL_FROM_AUTH && local.web_env.EMAIL_FROM_NOTICES == var.app_config.EMAIL_FROM_NOTICES && !contains(keys(local.web_env), "INBOUND_DOMAIN")
    error_message = "Web gets the two sender addresses and no inbound domain."
  }

  assert {
    condition     = contains(local.mounts.web, "RESEND_SENDING_API_KEY") && length(setintersection(local.mounts.web, ["RESEND_RECEIVING_API_KEY", "RESEND_WEBHOOK_SECRET"])) == 0
    error_message = "Web mounts the sending key and neither receiving secret."
  }

  assert {
    condition     = local.worker_env.EMAIL_FROM_AUTH == var.app_config.EMAIL_FROM_AUTH && local.worker_env.EMAIL_FROM_NOTICES == var.app_config.EMAIL_FROM_NOTICES && local.worker_env.INBOUND_DOMAIN == "in.skyclause.m1ku.tech"
    error_message = "The worker gets the two sender addresses and the inbound domain."
  }

  assert {
    condition     = length(setsubtract(local.mail_secrets, local.mounts.worker)) == 0
    error_message = "The worker mounts all three Resend secrets."
  }

  assert {
    condition = alltrue([
      length(setintersection(keys(local.env), ["EMAIL_FROM_AUTH", "EMAIL_FROM_NOTICES", "INBOUND_DOMAIN"])) == 0,
      length(setintersection(local.mounts.jobs, local.mail_secrets)) == 0,
      length(setintersection(local.worker_job_mounts, local.mail_secrets)) == 0,
    ])
    error_message = "No job, kms-rewrap included, gets a mail variable or a mail secret."
  }
}

run "half_a_set_fails_at_plan" {
  command = plan

  variables {
    supplied_secrets = ["RESEND_SENDING_API_KEY"]
  }

  expect_failures = [var.supplied_secrets]
}
