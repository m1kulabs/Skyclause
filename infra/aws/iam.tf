# Keyless access (D42): web and worker exchange a Google ID token from the metadata server for
# this role's credentials with AssumeRoleWithWebIdentity. No IAM user or access key exists.

locals {
  role_name = "${local.prefix}-email"
  # Built from the name so the trust policy can use it as the token audience without a cycle.
  role_arn = "arn:aws:iam::${local.account_id}:role/${local.role_name}"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["accounts.google.com"]
    }

    # A service account's token has azp and sub both set to its unique ID; AWS reads azp as :aud
    # and the requested audience as :oaud. The code requests AWS_ROLE_ARN as the audience.
    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:aud"
      values   = values(var.google_service_account_ids)
    }

    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:sub"
      values   = values(var.google_service_account_ids)
    }

    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:oaud"
      values   = [local.role_arn]
    }
  }
}

resource "aws_iam_role" "email" {
  name               = local.role_name
  description        = "Assumed by the web and worker Cloud Run services with Google ID tokens (#113)."
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

data "aws_iam_policy_document" "email" {
  statement {
    sid     = "Send"
    actions = ["ses:SendEmail"]
    resources = [
      aws_sesv2_email_identity.notices.arn,
      aws_sesv2_configuration_set.this.arn,
    ]
  }

  statement {
    sid       = "ReadAndDeleteInbound"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.inbound.arn}/*"]
  }

  # Without it S3 answers a missing key with 403, not 404, and the worker reads 404 as "an earlier
  # delivery already handled this message".
  statement {
    sid       = "ListInbound"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.inbound.arn]
  }
}

resource "aws_iam_role_policy" "email" {
  name   = "email"
  role   = aws_iam_role.email.id
  policy = data.aws_iam_policy_document.email.json
}
