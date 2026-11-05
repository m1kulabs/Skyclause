import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))

function run(args: string[], env: Record<string, string>) {
  const { PATH, HOME } = process.env
  return spawnSync('bun', [main, ...args], { env: { PATH, HOME, ...env }, encoding: 'utf8' })
}

test('the server fails its start naming the missing variable', () => {
  const result = run([], { APP_ENV: 'dev', WORKER_INVOKER_SA: 'worker-invoker@skyclause.iam.gserviceaccount.com' })
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/WORKER_URL/)
})

test('job <name> refuses an unregistered job', () => {
  const result = run(['job', 'no-such-job'], { APP_ENV: 'dev' })
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/unknown job no-such-job/)
})
