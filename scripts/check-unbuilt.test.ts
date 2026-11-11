import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./check-unbuilt.ts', import.meta.url))

const planted = plantRepo({
  'packages/db/src/tenant.ts':
    "import { notBuilt } from '@skyclause/contracts'\n\nexport const withTenant = notBuilt('x')\n",
  'apps/web/features/settings/panel.tsx': 'export const Panel = () => (\n  <section data-unbuilt="x" />\n)\n',
  'apps/web/features/alerts/card.tsx': "export const Card = () => <div data-unbuilt='c-alerts-ui' />\n",
  'docs/notes.md': "notBuilt('outside-apps-and-packages')\n",
  'packages/contracts/test/not-built.test.ts': "expect(() => notBuilt('in-a-test')()).toThrow()\n",
  'apps/web/e2e/set-7.spec.ts': 'await expect(page.locator(\'[data-unbuilt="in-a-spec"]\')).toHaveCount(0)\n'
})

function run(...args: string[]) {
  return spawnSync('bun', [script, ...args], { cwd: planted, encoding: 'utf8' })
}

test('lists every notBuilt and data-unbuilt placeholder with file and line, grouped by owner, and fails', () => {
  const result = run()
  expect(result.status).toBe(1)
  expect(result.stdout).toContain('x\n  apps/web/features/settings/panel.tsx:2\n  packages/db/src/tenant.ts:3\n')
  expect(result.stdout).toContain('c-alerts-ui\n  apps/web/features/alerts/card.tsx:1\n')
  expect(result.stdout).not.toContain('outside-apps-and-packages')
  expect(result.stdout).not.toContain('in-a-test')
  expect(result.stdout).not.toContain('in-a-spec')
})

test('--owner limits the list to one owner', () => {
  const result = run('--owner', 'c-alerts-ui')
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('tenant.ts')
})

test('--owner of an owner with nothing left passes', () => {
  const result = run('--owner', 'y')
  expect(result.status).toBe(0)
  expect(result.stdout).not.toContain('panel.tsx')
})

test('lists each operation without a handler under its owner, from packages/api', () => {
  const root = plantRepo({
    'packages/api/src/unbuilt.ts':
      "export const unbuiltOperations = () => [{ owner: 'b-windows-api', operationId: 'listWindows', method: 'GET', path: '/v1/projects/{id}/windows' }]\n"
  })
  const result = spawnSync('bun', [script], { cwd: root, encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stdout).toContain('b-windows-api\n  GET /v1/projects/{id}/windows (listWindows): no handler\n')
  expect(spawnSync('bun', [script, '--owner', 'y'], { cwd: root, encoding: 'utf8' }).status).toBe(0)
})

test('a tree without placeholders passes', () => {
  const result = spawnSync('bun', [script], {
    cwd: plantRepo({ 'packages/db/src/index.ts': 'export {}\n' }),
    encoding: 'utf8'
  })
  expect(result.status).toBe(0)
})

test('counts typed notBuilt calls, including multi-line generics and nested angle brackets', () => {
  const root = plantRepo({
    'apps/worker/src/alerts/index.ts': [
      "import { notBuilt } from '@skyclause/contracts'",
      "export const onDuty = notBuilt<OnDuty>('a-members-api')",
      "export const nested = notBuilt<Record<string, Array<Map<string, number>>>>('a-members-api')",
      'export const multi = notBuilt<{',
      '  handler: (id: string) => Promise<Array<string>>',
      "}>('b-signals-api')",
      ''
    ].join('\n')
  })
  const result = spawnSync('bun', [script], { cwd: root, encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stdout).toContain(
    'a-members-api\n  apps/worker/src/alerts/index.ts:2\n  apps/worker/src/alerts/index.ts:3\n'
  )
  expect(result.stdout).toContain('b-signals-api\n  apps/worker/src/alerts/index.ts:4\n')
})
