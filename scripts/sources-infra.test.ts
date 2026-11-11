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
  expect(run).toContain('merge(local.shared_config,')
  expect(run).not.toContain('SOURCE_USER_AGENT')
  expect(run).not.toMatch(/ADAPTER_USER_AGENT\s*=/)
})
test('production sets every value the source runner requires, and the user agent names a contact URL', () => {
  const names = (block: string) => [...block.matchAll(/^\s+([A-Z][A-Z0-9_]*)\s+=/gm)].map((match) => match[1]!)
  const required = [
    ...readFileSync(new URL('../apps/worker/src/sources/index.ts', import.meta.url), 'utf8').matchAll(
      /required\('([A-Z][A-Z0-9_]*)'\)/g
    )
  ].map((match) => match[1]!)
  const runEnv = read('run.tf')
    .split(/\n\s+env\s+= merge\(local\.shared_config, \{/)[1]!
    .split('\n  })')[0]!
  const appConfig = read('terraform.tfvars').split('\napp_config = {')[1]!.split('\n}\n')[0]!
  expect(required).toContain('ADAPTER_USER_AGENT')
  expect(required.filter((name) => ![...names(runEnv), ...names(appConfig)].includes(name))).toEqual([])
  // A product token and a contact URL, which public data providers ask a client to send.
  expect(appConfig).toMatch(/^\s+ADAPTER_USER_AGENT\s+= "[A-Za-z][\w.-]*\/\d[\w.-]* \(\+https:\/\/[^\s)"]+\)"$/m)
})
