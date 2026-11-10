# KMS: one software KEK per purpose, rotated every 90 days (TRD BYOK). `web` seals, the worker
# is the only decrypter (D39). The worker also encrypts on `ai-keys`, for kms:rewrap (#206).

resource "google_kms_key_ring" "skyclause" {
  name     = "skyclause"
  location = local.region
}

locals {
  kms_keys = ["ai-keys", "webhook"]
}

resource "google_kms_crypto_key" "this" {
  for_each = toset(local.kms_keys)

  name            = each.key
  key_ring        = google_kms_key_ring.skyclause.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "SOFTWARE"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "this" {
  for_each = {
    for pair in setproduct(local.kms_keys, [
      { account = "web", role = "roles/cloudkms.cryptoKeyEncrypter" },
      { account = "worker", role = "roles/cloudkms.cryptoKeyDecrypter" },
    ]) : "${pair[0]} ${pair[1].account}" => { key = pair[0], account = pair[1].account, role = pair[1].role }
  }

  crypto_key_id = google_kms_crypto_key.this[each.value.key].id
  role          = each.value.role
  member        = local.member[each.value.account]
}

# kms:rewrap (#206) opens each AI key's DEK and wraps it again under the primary version, as `worker`.
resource "google_kms_crypto_key_iam_member" "worker_rewrap" {
  crypto_key_id = google_kms_crypto_key.this["ai-keys"].id
  role          = "roles/cloudkms.cryptoKeyEncrypter"
  member        = local.member.worker
}

# The platform rotation audit lists version metadata for this purpose only.
resource "google_kms_crypto_key_iam_member" "worker_rotation_audit" {
  crypto_key_id = google_kms_crypto_key.this["ai-keys"].id
  role          = "roles/cloudkms.viewer"
  member        = local.member.worker
}
