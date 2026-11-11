# kms:rewrap (#206): moves every sealed AI key row onto the primary KEK version after rotation. Runs on
# DATABASE_URL_SYSTEM; needs KMS_AI_KEYS_KEY (local.env) to unwrap and wrap each DEK.
#
# It runs as `worker`, the only account that may open a sealed key (D39). Re-wrapping also encrypts each DEK under the
# primary version, so kms.tf grants `worker` cryptoKeyEncrypter on `ai-keys` too; `web` still can't open anything.
# It mounts the worker's secrets without the mail ones (secrets.tf, worker_job_mounts), as no job takes mail values.
module "kms_rewrap" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "kms-rewrap"
  service_account           = local.sa.worker
  args                      = ["job", "kms:rewrap"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "kms-rewrap" })
  secrets                   = { for name in local.worker_job_mounts : name => name }
  schedule                  = "15 4 * * *"
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
    google_kms_crypto_key_iam_member.worker_rewrap,
  ]
}
