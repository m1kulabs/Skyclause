# KMS: one software KEK per purpose, rotated every 90 days (TRD BYOK). `web` seals, the worker
# is the only decrypter (D39).

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
