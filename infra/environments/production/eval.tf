# Vertex-only identity for #149's eval suite, which runs on pull requests (#79 §6). It has its
# own pool, so P0's pool and provider stay untouched (D10). Any pull request run in this
# repository can use it, so it holds no role but roles/aiplatform.user.

resource "google_iam_workload_identity_pool" "eval" {
  workload_identity_pool_id = "github-eval"
  display_name              = "GitHub pull requests"
  description               = "Agent evals on pull requests of m1kulabs/Skyclause (#149)."
}

resource "google_iam_workload_identity_pool_provider" "eval" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.eval.workload_identity_pool_id
  workload_identity_pool_provider_id = "skyclause-pr"
  display_name                       = "Skyclause pull requests"

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }
  attribute_condition = "assertion.repository_id == '1444328887' && assertion.event_name == 'pull_request'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "eval" {
  account_id   = "skyclause-eval"
  display_name = "eval"
  description  = "Vertex AI only, for agent evals on pull requests (#149)."
}

resource "google_project_iam_member" "eval" {
  project = local.project_id
  role    = "roles/aiplatform.user"
  member  = google_service_account.eval.member
}

resource "google_service_account_iam_member" "eval_wif" {
  service_account_id = google_service_account.eval.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.eval.name}/attribute.repository_id/1444328887"
}
