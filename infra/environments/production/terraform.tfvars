# Values other tickets make (infra/README.md, "Values set by other tickets"); variables.tf validates them.

app_config = {
  # #113: infra/aws's app_config output, applied 6 Nov 2026.
  AWS_ROLE_ARN             = "arn:aws:iam::776566309118:role/skyclause-production-email"
  EMAIL_FROM_AUTH          = "Skyclause <sign-in@notices.skyclause.m1ku.tech>"
  EMAIL_FROM_NOTICES       = "Skyclause <notices@notices.skyclause.m1ku.tech>"
  INBOUND_BUCKET           = "skyclause-production-inbound-776566309118"
  INBOUND_DOMAIN           = "in.skyclause.m1ku.tech"
  INBOUND_SNS_TOPIC_ARN    = "arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound"
  SES_CONFIGURATION_SET    = "skyclause-production"
  SES_EVENTS_SNS_TOPIC_ARN = "arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events"
  SES_REGION               = "ap-southeast-2"
}
