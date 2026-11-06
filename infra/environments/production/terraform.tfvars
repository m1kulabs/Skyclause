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

  # #113: logged by the vapid-keys job's first run (vapid-keys-wg7x9), 6 Nov 2026. VAPID_SUBJECT is
  # APP_ORIGIN, set in run.tf.
  VAPID_PUBLIC_KEY = "BA3OuKdQLlNKGUWzWI4yKm7YRt0quF-UVkAfYZ7SWlvNp5tA7nFX0M4hesxjmVsfkup-jgs2BUlV4CmdrDML1NE"

  # #118 gate 3: printed by infra/wizards/google-sign-in.sh, 6 Nov 2026.
  GOOGLE_CLIENT_ID   = "413187272599-fgputod4kurkfmjt0ep3j46kif77ih0b.apps.googleusercontent.com"
  TURNSTILE_SITE_KEY = "0x4AAAAAAF1nsaULaL3xWos0"
}

# #118 gate 3: each has a version, from infra/wizards/google-sign-in.sh and staff-and-ses.sh.
supplied_secrets = ["GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]

# VAPID_PRIVATE_KEY has its one version (#113), so the worker mounts it.
vapid_private_key_ready = true

# #118 gate 1: Search Console lists skyclause.m1ku.tech as verified (infra/wizards/search-console.sh,
# 6 Nov 2026) with skyclause-terraform added as an owner. host_mode stays single until each
# mapping's certificate is active (infra/README.md, "Custom hosts").
map_domains = true
