import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
const infra = (file: string) =>
  readFileSync(new URL(`../../../infra/environments/production/${file}`, import.meta.url), 'utf8')

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

/**
 * The names a job gets from infra/environments/production: run.tf's `local.env` (its own block plus app_config's
 * non-mail values, `shared_config`), the job's own `env` map and its account's secrets (secrets.tf `wanted_secrets`).
 * Values are Terraform's literals where it has them, shaped stand-ins otherwise, and the test database's URLs.
 */
function terraformJobEnv(file: string) {
  const pairs = (block: string) =>
    [...block.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s+=\s*(.+?)\s*$/gm)].map((m) => [m[1]!, m[2]!] as const)
  const quoted = (block: string) => [...block.matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]!)
  // The one shape each read expects; another shape (a map over several lines, another local) fails naming both.
  const shape = (tf: string, pattern: RegExp) => {
    const found = infra(tf).match(pattern)?.[1]
    if (found === undefined) throw new Error(`${tf} has no ${pattern}; teach terraformJobEnv its shape`)
    return found
  }
  const mail = quoted(
    shape('run.tf', /\n\s+sending_values\s+= (\[.*\])/) + shape('run.tf', /\n\s+receiving_values\s+= (\[.*\])/)
  )
  const appConfig = pairs(shape('terraform.tfvars', /\napp_config = \{([\s\S]*?)\n\}\n/))
  const plain = [
    ...appConfig.filter(([name]) => !mail.includes(name)),
    ...pairs(shape('run.tf', /\n\s+env\s+= merge\(local\.shared_config, \{([\s\S]*?)\n {2}\}\)/)),
    ...pairs(shape(file, /\n\s+env\s+= merge\(local\.env, \{(.*)\}\)\n/).replace(/,\s*/g, '\n'))
  ]
  const account = shape(file, /\n\s+secrets\s+= \{ for name in local\.mounts\.(\w+) : name => name \}\n/)
  const secrets = quoted(shape('secrets.tf', new RegExp(`\\n\\s+${account}\\s+= (\\[[^\\]]*\\])`)))
  const value = (name: string, expression: string) => {
    if (expression.startsWith('"')) return JSON.parse(expression) as string
    if (name === 'APP_ENV') return 'production' // variables.tf allows no other app_env
    if (name === 'HOST_MODE') return 'multi'
    if (name === 'LOG_LEVEL') return 'info'
    if (name === 'WORKER_URL' || expression.startsWith('local.origins.')) return `https://${name.toLowerCase()}.test`
    if (name === 'WORKER_INVOKER_SA') return 'invoker@test.iam.gserviceaccount.com'
    return `test-${name.toLowerCase().replaceAll('_', '-')}`
  }
  return {
    ...Object.fromEntries(plain.map(([name, expression]) => [name, value(name, expression)])),
    ...Object.fromEntries(secrets.map((name) => [name, process.env[name] ?? 'test-secret-'.padEnd(64, '0')]))
  }
}

test('org-purge runs on exactly the environment org-purge.tf gives it', () => {
  const env = terraformJobEnv('org-purge.tf')
  // Terraform sets GCP_PROJECT, which makes the entry export telemetry to that Google project. Every profile has it
  // optional, so the test drops it.
  expect(env).toHaveProperty('GCP_PROJECT')
  delete env.GCP_PROJECT
  // No HOME (no gcloud credentials to find) and no .env file: the child gets these names and PATH, nothing else. The
  // test database is fresh for this file, so no organisation is due and no bucket is called.
  const result = spawnSync('bun', ['--no-env-file', main, 'job', 'org:purge'], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 30_000
  })
  expect(result.status, result.stderr).toBe(0)
}, 30_000)
