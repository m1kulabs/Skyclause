import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
const read = (path: string) =>
  readFileSync(new URL(`../infra/environments/production/${path}`, import.meta.url), 'utf8')
test('sources use pull-only results, worker subscriber IAM and real daily job modules', () => {
  const messaging = read('messaging.tf'),
    sources = read('sources.tf'),
    run = read('run.tf')
  const subscription = messaging
    .split('resource "google_pubsub_subscription" "poll_results"')[1]!
    .split('resource ')[0]!
  expect(subscription).not.toContain('push_config')
  expect(messaging).toContain('roles/pubsub.subscriber')
  expect(messaging).toContain('member       = local.member.worker')
  expect(sources).toContain('source   = "../../modules/job"')
  expect(sources).toContain('catalogue-sync')
  expect(sources).toContain('adapter-contracts')
  expect(sources).toContain('service_account           = local.sa.jobs')
  expect(run).toContain('SOURCE_RESULTS_SUBSCRIPTION')
  expect(read('variables.tf')).toContain('ADAPTER_USER_AGENT')
  expect(run).toContain('merge(var.app_config,')
  expect(run).not.toContain('SOURCE_USER_AGENT')
  expect(run).not.toMatch(/ADAPTER_USER_AGENT\s*=/)
})
