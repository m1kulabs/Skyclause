# The email role's SES grant (#623), planned offline: `terraform -chdir=infra/aws init -backend=false`, then
# `terraform -chdir=infra/aws test`. No AWS call is made, so this checks the statement, not how SES evaluates it.

provider "aws" {
  region                      = "ap-southeast-2"
  access_key                  = "offline"
  secret_key                  = "offline"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

# Known at plan, so the statement's resources are. The document itself renders only at apply.
override_resource {
  target          = aws_sesv2_configuration_set.this
  override_during = plan
  values = {
    arn = "arn:aws:ses:ap-southeast-2:111122223333:configuration-set/skyclause-production"
  }
}

run "sends_from_notices_to_any_verified_identity" {
  command = plan

  # In the sandbox (D48) SES checks the verified recipient's identity too, and checks a raw message as
  # ses:SendRawEmail: production refused exactly that on 11 November 2026.
  assert {
    condition = jsonencode(one([
      for s in data.aws_iam_policy_document.email.statement : s if s.sid == "Send"
    ]).actions) == jsonencode(["ses:SendEmail", "ses:SendRawEmail"])
    error_message = "The role sends with ses:SendEmail and ses:SendRawEmail, nothing else."
  }

  assert {
    condition = jsonencode(one([
      for s in data.aws_iam_policy_document.email.statement : s if s.sid == "Send"
      ]).resources) == jsonencode([
      "arn:aws:ses:ap-southeast-2:111122223333:configuration-set/skyclause-production",
      "arn:aws:ses:ap-southeast-2:${local.account_id}:identity/*",
    ])
    error_message = "The role sends through the identities of the account's Sydney SES and its configuration set only."
  }

  assert {
    condition = jsonencode(one([
      for s in data.aws_iam_policy_document.email.statement : s if s.sid == "Send"
      ]).condition) == jsonencode([
      { test = "StringLike", values = ["*@notices.skyclause.m1ku.tech"], variable = "ses:FromAddress" },
    ])
    error_message = "The role sends only from an address at notices.skyclause.m1ku.tech."
  }

  assert {
    condition = jsonencode([
      for s in data.aws_iam_policy_document.email.statement : [s.effect, s.not_actions, s.not_resources] if s.sid == "Send"
    ]) == jsonencode([[null, null, null]])
    error_message = "The send statement is a plain Allow, with no NotAction or NotResource."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.email.statement : s.sid == "Send" || alltrue([
        for action in s.actions : !startswith(action, "ses:")
      ])
    ])
    error_message = "No other statement grants an SES action."
  }
}
