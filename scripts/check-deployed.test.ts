import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./check-deployed.ts', import.meta.url))

const IMAGE = 'asia-southeast1-docker.pkg.dev/skyclause/skyclause/app@sha256:' + 'a'.repeat(64)

type Env = { name: string; value?: string; valueFrom?: unknown }

// The shapes `gcloud run services describe` and `gcloud run jobs describe` print with `--format=json`.
const service = (name: string, env: Env[], image = IMAGE) => ({
  apiVersion: 'serving.knative.dev/v1',
  kind: 'Service',
  metadata: { name },
  spec: { template: { spec: { containers: [{ image, env }] } } }
})

const job = (name: string, env: Env[], image = IMAGE) => ({
  apiVersion: 'run.googleapis.com/v1',
  kind: 'Job',
  metadata: { name },
  spec: { template: { spec: { template: { spec: { containers: [{ image, env }] } } } } }
})

const production: Env[] = [
  { name: 'APP_ENV', value: 'production' },
  { name: 'DATABASE_URL_APP', valueFrom: { secretKeyRef: { name: 'DATABASE_URL_APP', key: 'latest' } } }
]

function run(resources: object[], ...args: string[]) {
  const dir = plantRepo(Object.fromEntries(resources.map((r, i) => [`${i}.json`, JSON.stringify(r)])))
  const files = resources.map((_, i) => join(dir, `${i}.json`))
  return spawnSync('bun', [script, ...args, ...files], { encoding: 'utf8' })
}

test('fails naming a service that runs APP_ENV=test', () => {
  const result = run([service('web', production), service('worker', [{ name: 'APP_ENV', value: 'test' }])])
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/worker: APP_ENV=test/)
  expect(result.stderr).not.toMatch(/web:/)
})

test('fails naming a job that runs APP_ENV=test', () => {
  const result = run([job('migrate', production), job('catalogue-sync', [{ name: 'APP_ENV', value: 'test' }])])
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/catalogue-sync: APP_ENV=test/)
})

test('fails on a resource without APP_ENV, since nothing then shows it is not test', () => {
  const result = run([service('web', [])])
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/web: APP_ENV is unset/)
})

test('fails on a describe output with no containers rather than passing it', () => {
  const result = run([{ metadata: { name: 'web' }, spec: {} }])
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/web: no containers found/)
})

test('with --image, fails naming a service or job on another digest', () => {
  const previous = IMAGE.replace(/a{64}$/, 'b'.repeat(64))
  const result = run([service('web', production), job('migrate', production, previous)], '--image', IMAGE)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(`migrate: runs ${previous}, not ${IMAGE}`)
  expect(result.stderr).not.toMatch(/web:/)
})

test('passes and prints every resource when all run production on the digest', () => {
  const result = run(
    [service('web', production), service('worker', production), job('migrate', production)],
    '--image',
    IMAGE
  )
  expect(result.status).toBe(0)
  expect(result.stdout).toBe(
    ['web', 'worker', 'migrate'].map((name) => `${name}: APP_ENV=production image=${IMAGE}\n`).join('')
  )
})

test('reads `gcloud run services list` and `jobs list` output, an array per file', () => {
  const dir = plantRepo({
    'services.json': JSON.stringify([service('web', production), service('worker', production)]),
    'jobs.json': JSON.stringify([job('migrate', [{ name: 'APP_ENV', value: 'test' }])])
  })
  const result = spawnSync('bun', [script, join(dir, 'services.json'), join(dir, 'jobs.json')], { encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stdout).toMatch(/^web: .*\nworker: .*\nmigrate: APP_ENV=test/)
  expect(result.stderr).toMatch(/migrate: APP_ENV=test/)
})
