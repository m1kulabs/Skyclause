import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
const read = (path: string) =>
  readFileSync(new URL(`../infra/environments/production/${path}`, import.meta.url), 'utf8')
test('the retention job mounts EMAIL_HASH_KEY from Secret Manager, on its own, through a jobs grant', () => {
  const retention = read('retention.tf'),
    secrets = read('secrets.tf')
  const job = retention.split('module "retention"')[1]!.split('\n}\n')[0]!
  const grant = secrets
    .split('resource "google_secret_manager_secret_iam_member" "retention_hash_key"')[1]!
    .split('\n}\n')[0]!
  expect(job).toContain('EMAIL_HASH_KEY = "EMAIL_HASH_KEY"')
  expect(job).toContain('google_secret_manager_secret_iam_member.retention_hash_key')
  // The schedule runs: #110's erasure has merged, so the nightly sweep is no longer held back.
  expect(job).toMatch(/\n\s+paused\s+= false\n/)
  expect(grant).toContain('google_secret_manager_secret.this["EMAIL_HASH_KEY"].secret_id')
  expect(grant).toContain('roles/secretmanager.secretAccessor')
  expect(grant).toMatch(/member\s+= local\.member\.jobs/)
  // The other jobs mount local.mounts.jobs, so the shared list must not gain the key.
  expect(secrets).toMatch(/\n\s+jobs\s+= \["DATABASE_URL_SYSTEM", "DATABASE_URL_RETENTION"\]\n/)
})
