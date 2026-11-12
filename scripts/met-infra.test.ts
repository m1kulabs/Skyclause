import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('met_jobs_use_real_cadence_and_no_retry', () => {
  const config = readFileSync(new URL('../infra/environments/production/met-weather.tf', import.meta.url), 'utf8')
  for (const [kind, name, schedule] of [
    ['met_warning', 'adapter-met-warning', '*/10 * * * *'],
    ['met_forecast', 'adapter-met-forecast', '0 */6 * * *']
  ]) {
    const block = config.split(`module "${kind}"`)[1]!.split('\n}')[0]!
    for (const text of [
      'source = "../../modules/job"',
      `name                      = "${name}"`,
      `args                      = ["job", "adapter", "${kind}"]`,
      `schedule                  = "${schedule}"`,
      'time_zone                 = "Asia/Kuala_Lumpur"',
      'max_retries               = 0',
      'service_account           = local.sa.jobs',
      'scheduler_service_account = local.sa.invoker',
      `env                       = merge(local.env, { OTEL_SERVICE_NAME = "${name}" })`,
      'secrets                   = { for name in local.mounts.jobs : name => name }',
      'google_secret_manager_secret_iam_member.access',
      'google_secret_manager_secret_version.generated',
      'google_secret_manager_secret_version.database'
    ])
      expect(block).toContain(text)
  }
  expect(config).not.toMatch(/catalogue-sync|adapter-contracts/)
  const daily = readFileSync(new URL('../infra/environments/production/sources.tf', import.meta.url), 'utf8')
  expect(daily).toContain('for_each = { catalogue-sync = "10 1 * * *", adapter-contracts = "40 1 * * *" }')
})
