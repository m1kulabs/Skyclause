# Amazon SES for Skyclause production (#113): sending from notices.skyclause.m1ku.tech, receiving
# for in.skyclause.m1ku.tech (D7 in #79), and the role Cloud Run assumes with Google ID tokens
# (D42). DNS stays with a person: every record to enter is an output.

locals {
  account_id = "776566309118"
  # Sydney, not Singapore: the account's Organizations SCP denies every other region (user's
  # decision, 6 Nov 2026). Receiving and its SNS topics must sit in the SES region.
  region = "ap-southeast-2"
  prefix = "skyclause-production"

  sending_domain   = "notices.skyclause.m1ku.tech"
  mail_from_domain = "bounce.${local.sending_domain}"
  inbound_domain   = "in.skyclause.m1ku.tech"

  # #89's deterministic Cloud Run URL for the worker in project 413187272599.
  worker_url = "https://worker-413187272599.asia-southeast1.run.app"

  # SNS's default gives up on an HTTPS endpoint after 3 retries 20 s apart, and an inbound
  # notification can't be replayed. Exponential 20 s to 10 min over 10 retries rides out about
  # half an hour of worker downtime, inside SNS's 3,600 s ceiling.
  delivery_policy = jsonencode({
    healthyRetryPolicy = {
      minDelayTarget  = 20
      maxDelayTarget  = 600
      numRetries      = 10
      backoffFunction = "exponential"
    }
  })

  # Built from names so the bucket policy can name the rule before the rule exists.
  rule_set_name     = local.prefix
  receipt_rule_name = "inbound"
  receipt_rule_arn  = "arn:aws:ses:${local.region}:${local.account_id}:receipt-rule-set/${local.rule_set_name}:receipt-rule/${local.receipt_rule_name}"

  # DMARC aggregate reports for notices. (its rua), kept apart from the worker's mail (#118).
  dmarc_address   = "dmarc@${local.inbound_domain}"
  dmarc_rule_name = "dmarc-reports"
  dmarc_rule_arn  = "arn:aws:ses:${local.region}:${local.account_id}:receipt-rule-set/${local.rule_set_name}:receipt-rule/${local.dmarc_rule_name}"
}
