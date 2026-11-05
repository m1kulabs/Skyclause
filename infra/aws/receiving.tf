# Receiving (D7): mail for in.skyclause.m1ku.tech is scanned, stored in the inbound bucket and
# announced on SNS to the worker's /ses/inbound, which reads and deletes it.

# Receiving needs a verified domain, and in. is a sibling of notices., so it's its own identity.
resource "aws_sesv2_email_identity" "inbound" {
  email_identity = local.inbound_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_s3_bucket" "inbound" {
  bucket = "${local.prefix}-inbound-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "inbound" {
  bucket = aws_s3_bucket.inbound.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The worker deletes each message once handled; this catches any it never reached.
resource "aws_s3_bucket_lifecycle_configuration" "inbound" {
  bucket = aws_s3_bucket.inbound.id

  rule {
    id     = "expire"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }
  }
}

data "aws_iam_policy_document" "inbound_bucket" {
  # Only this account's receipt rule may write (confused-deputy guard).
  statement {
    sid       = "AllowSESPuts"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.inbound.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [local.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [local.receipt_rule_arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.inbound.arn, "${aws_s3_bucket.inbound.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "inbound" {
  bucket = aws_s3_bucket.inbound.id
  policy = data.aws_iam_policy_document.inbound_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.inbound]
}

resource "aws_sns_topic" "inbound" {
  name              = "${local.prefix}-inbound"
  signature_version = 2
}

# A same-account topic works without a grant; this one also pins SES to this receipt rule.
data "aws_iam_policy_document" "inbound_topic" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.inbound.arn]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [local.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [local.receipt_rule_arn]
    }
  }
}

resource "aws_sns_topic_policy" "inbound" {
  arn    = aws_sns_topic.inbound.arn
  policy = data.aws_iam_policy_document.inbound_topic.json
}

resource "aws_sns_topic_subscription" "inbound" {
  topic_arn = aws_sns_topic.inbound.arn
  protocol  = "https"
  endpoint  = "${local.worker_url}/ses/inbound"

  delivery_policy = local.delivery_policy
}

resource "aws_ses_receipt_rule_set" "this" {
  rule_set_name = local.rule_set_name
}

resource "aws_ses_receipt_rule" "inbound" {
  name          = local.receipt_rule_name
  rule_set_name = aws_ses_receipt_rule_set.this.rule_set_name
  recipients    = [local.inbound_domain]
  enabled       = true
  scan_enabled  = true
  tls_policy    = "Require"

  s3_action {
    position    = 1
    bucket_name = aws_s3_bucket.inbound.id
    topic_arn   = aws_sns_topic.inbound.arn
  }

  # SES checks it can write to the bucket when the rule is saved.
  depends_on = [aws_s3_bucket_policy.inbound, aws_sns_topic_policy.inbound]
}

# One rule set is active per account and region; this is the only one.
resource "aws_ses_active_receipt_rule_set" "this" {
  rule_set_name = aws_ses_receipt_rule_set.this.rule_set_name

  depends_on = [aws_ses_receipt_rule.inbound]
}
