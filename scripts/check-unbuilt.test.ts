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

test('a tree without placeholders passes', () => {
  const result = spawnSync('bun', [script], {
    cwd: plantRepo({ 'packages/db/src/index.ts': 'export {}\n' }),
    encoding: 'utf8'
  })
  expect(result.status).toBe(0)
})
