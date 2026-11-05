output "web_url" {
  value = local.web_url
}

output "worker_url" {
  value = local.worker_url
}

output "service_accounts" {
  value = merge(local.sa, { eval = google_service_account.eval.email })
}

output "artifact_registry" {
  description = "Docker repository for #90's image."
  value       = "${local.region}-docker.pkg.dev/${local.project_id}/${google_artifact_registry_repository.skyclause.repository_id}"
}

output "eval_workload_identity_provider" {
  description = "For #149's google-github-actions/auth step."
  value       = google_iam_workload_identity_pool_provider.eval.name
}

output "neon_project_id" {
  value = neon_project.main.id
}

output "dns_records" {
  description = "Records to create in Cloudflare for each mapped host, DNS only (not proxied)."
  value = {
    for host, mapping in google_cloud_run_domain_mapping.this : host => [
      for record in mapping.status[0].resource_records : { type = record.type, name = record.name, rrdata = record.rrdata }
    ]
  }
}
