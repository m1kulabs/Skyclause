import { spawnSync } from 'node:child_process'
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
