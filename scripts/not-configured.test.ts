import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./not-configured.ts', import.meta.url))

function run(cwd: string, ...args: string[]) {
  return spawnSync('bun', [script, ...args], { cwd, encoding: 'utf8' })
}

test('prints not configured and passes while nothing it checks exists', () => {
  const result = run(plantRepo({ 'packages/db/src/index.ts': 'export {}\n' }), 'f-db', '.sql', 'packages/db')
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe('not configured: f-db')
})

test('fails once the thing it checks exists, so the owner replaces the stub', () => {
  const root = plantRepo({ 'packages/db/migrations/0000_roles.sql': 'select 1;\n' })
  const result = run(root, 'f-db', '.sql', 'packages/db')
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/packages\/db\/migrations\/0000_roles\.sql/)
  expect(result.stderr).toMatch(/f-db/)
})

test('ignores node_modules', () => {
  const root = plantRepo({ 'packages/api/node_modules/x/openapi.json': '{}' })
  expect(run(root, 'f-api', 'openapi.json', 'apps', 'packages').status).toBe(0)
})

test('the root stubs pass on this tree and fail once their owner’s artifact exists', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts as Record<
    string,
    string
  >
  const artifacts: Record<string, string> = {
    'openapi:check': 'packages/api/openapi.json'
  }
  for (const [name, artifact] of Object.entries(artifacts)) {
    const args = scripts[name]!.replace(/^bun scripts\/not-configured\.ts /, '').split(' ')
    expect(run(plantRepo({ 'packages/db/src/index.ts': 'export {}\n' }), ...args).status, name).toBe(0)
    expect(run(plantRepo({ [artifact]: '{}' }), ...args).status, name).toBe(1)
  }
})
