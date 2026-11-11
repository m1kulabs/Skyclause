# Values other tickets make (infra/README.md, "Values set by other tickets"); variables.tf validates them.

app_config = {
  # #653: the sender addresses and the inbound domain, on the Resend domains infra/wizards/resend.sh sets up.
  EMAIL_FROM_AUTH    = "Skyclause <sign-in@notices.skyclause.m1ku.tech>"
  EMAIL_FROM_NOTICES = "Skyclause <notices@notices.skyclause.m1ku.tech>"
  INBOUND_DOMAIN     = "in.skyclause.m1ku.tech"

  # #113: logged by the vapid-keys job's first run (vapid-keys-wg7x9), 6 Nov 2026. VAPID_SUBJECT is
  # APP_ORIGIN, set in run.tf.
  VAPID_PUBLIC_KEY = "BA3OuKdQLlNKGUWzWI4yKm7YRt0quF-UVkAfYZ7SWlvNp5tA7nFX0M4hesxjmVsfkup-jgs2BUlV4CmdrDML1NE"

  # #118 gate 3: printed by infra/wizards/google-sign-in.sh, 6 Nov 2026.
  GOOGLE_CLIENT_ID   = "413187272599-fgputod4kurkfmjt0ep3j46kif77ih0b.apps.googleusercontent.com"
  TURNSTILE_SITE_KEY = "0x4AAAAAAF1nsaULaL3xWos0"

  # #612: the upstream identification string every source request sends (#79 §6, source-runner design),
  # as a product token with a contact URL; chosen 11 Nov 2026, the owner's to change.
  ADAPTER_USER_AGENT = "Skyclause/1.0 (+https://skyclause.m1ku.tech)"
}

# #118 gate 3: each has a version, from infra/wizards/google-sign-in.sh and staff-and-ses.sh.
supplied_secrets = ["GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]

# VAPID_PRIVATE_KEY has its one version (#113), so the worker mounts it.
vapid_private_key_ready = true

# #118 gate 1: Search Console lists skyclause.m1ku.tech as verified (infra/wizards/search-console.sh,
# 6 Nov 2026) with skyclause-terraform added as an owner.
map_domains = true

# #118 gate 1: every mapping's certificate is active (Ready, CertificateProvisioned), so each surface
# gets its own host (infra/README.md, "Custom hosts").
host_mode = "multi"
origins = {
  marketing = "https://skyclause.m1ku.tech"
  app       = "https://app.skyclause.m1ku.tech"
  api       = "https://api.skyclause.m1ku.tech"
  mcp       = "https://mcp.skyclause.m1ku.tech"
  embed     = "https://embed.skyclause.m1ku.tech"
  docs      = "https://docs.skyclause.m1ku.tech"
}
