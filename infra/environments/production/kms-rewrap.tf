# kms:rewrap (#206): moves every sealed AI key row onto the primary KEK version after rotation. Runs as `jobs`, on
# DATABASE_URL_SYSTEM; needs KMS_AI_KEYS_KEY (local.env) to unwrap and wrap each DEK.
#
# The schedule starts paused: re-wrapping needs both cryptoKeyDecrypter and cryptoKeyEncrypter on `ai-keys`, and
# kms.tf grants `jobs` neither (D39 keeps sealing on `web` and opening on `worker`). Grant both to `jobs`, or run this
# job as another account, then unpause.
module "kms_rewrap" {
  source = "../../modules/job"

  project_id                = local.project_id
  region                    = local.region
  name                      = "kms-rewrap"
  service_account           = local.sa.jobs
  args                      = ["job", "kms:rewrap"]
  env                       = merge(local.env, { OTEL_SERVICE_NAME = "kms-rewrap" })
  secrets                   = { for name in local.mounts.jobs : name => name }
  schedule                  = "15 4 * * *"
  paused                    = true
  scheduler_service_account = local.sa.invoker

  # Cloud Run checks a revision's secrets and its access to them when it deploys it.
  depends_on = [
    google_secret_manager_secret_iam_member.access,
    google_secret_manager_secret_version.generated,
    google_secret_manager_secret_version.database,
  ]
}
