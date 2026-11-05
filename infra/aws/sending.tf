# Sending: one identity, one configuration set whose events go to the worker's /ses/events (#158).

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = local.prefix
}

resource "aws_sns_topic" "ses_events" {
  name              = "${local.prefix}-ses-events"
  signature_version = 2
}

# An SNS event destination needs this grant; it admits SES only for this configuration set.
data "aws_iam_policy_document" "ses_events" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ses_events.arn]

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
      values   = [aws_sesv2_configuration_set.this.arn]
    }
  }
}

resource "aws_sns_topic_policy" "ses_events" {
  arn    = aws_sns_topic.ses_events.arn
  policy = data.aws_iam_policy_document.ses_events.json
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name
  event_destination_name = "sns"

  event_destination {
    enabled              = true
    matching_event_types = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT", "DELIVERY_DELAY"]

    sns_destination {
      topic_arn = aws_sns_topic.ses_events.arn
    }
  }

  depends_on = [aws_sns_topic_policy.ses_events]
}

resource "aws_sesv2_email_identity" "notices" {
  email_identity         = local.sending_domain
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "notices" {
  email_identity         = aws_sesv2_email_identity.notices.email_identity
  mail_from_domain       = local.mail_from_domain
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_sns_topic_subscription" "ses_events" {
  topic_arn = aws_sns_topic.ses_events.arn
  protocol  = "https"
  endpoint  = "${local.worker_url}/ses/events"

  delivery_policy = local.delivery_policy
}
